import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path, { normalize } from "path";
import { fileURLToPath } from "url";

import feedRoutes from "./routes/feed.js";
import healthRoutes from "./routes/health.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import normalizeCreator from "./routes/normalizeCreator.js";
import { scrapingConstantsCache } from "./functions/scrapingConstantsCache.js";
import { syncNewsFeed } from "./scraper/newsFetcher.js";
import {
  syncInstagramMedia,
  cleanupOldInstagramMedia,
} from "./utils/mediaCDNWorker.js";
import {
  creatorTrendScoreCalc,
  InstagramPosts,
  runBoostScrape,
  syncCreatorFollowers,
  TwitterPosts,
  YoutubeShorts,
} from "./scraper/socialMediaScraper.js";
import { cacheWarming } from "./cache/cacheWarming.js";
import versionCheck from "./middleware/versionChecker.js";
import genre from "./routes/genre.js";
import creatorsRank from "./routes/creatorsRank.js";
import userCreatorScreen from "./routes/userCreatorScreen.js";
import cdnRoutes from "./routes/cdnRoutes.js";
import { CACHING_KEYS } from "./cache/cacheKeys.js";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_PANEL_PATH = path.join(__dirname, "../admin-panel");

app.use(cors());

app.use(express.json());
app.use("/api", versionCheck);
app.use(express.static(path.join(process.cwd(), "public")));

app.use("/health", healthRoutes);
app.use("/admin", adminRoutes);
app.use("/admin/cdn", cdnRoutes);

app.use("/api/feed", feedRoutes);
app.use("/api/genre", genre);
app.use("/api/user", userRoutes);
app.use("/api/creator-screen-feed", userCreatorScreen);
app.use("/api/rank", creatorsRank);
app.use("/api/creator", normalizeCreator);

app.get("/proxy", async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);

    if (!url) {
      return res.status(400).send("Missing URL");
    }

    const parsed = new URL(url);

    let referer = "https://imginn.com/";

    if (
      parsed.hostname.includes("twitter.com") ||
      parsed.hostname.includes("twimg.com") ||
      parsed.hostname.includes("video.twimg.com")
    ) {
      referer = "https://twitter.com";
    }

    if (
      parsed.hostname.includes("instagram.com") ||
      parsed.hostname.includes("cdninstagram.com") ||
      parsed.hostname.includes("fbcdn.net") ||
      parsed.hostname.includes("instagram.fark1-1.fna")
    ) {
      referer = "https://www.instagram.com/";
    }

    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
        Referer: referer,
        Origin: referer,
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "cors",
      },
    });

    if (!response.ok) {
      return res.status(response.status).send("Image fetch failed");
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    const buffer = Buffer.from(await response.arrayBuffer());

    // IMPORTANT
    res.removeHeader("Cross-Origin-Resource-Policy");
    res.removeHeader("Cross-Origin-Embedder-Policy");

    res.set({
      "Content-Type": contentType,
      "Content-Length": buffer.length,
      "Cache-Control": "public,max-age=86400",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });

    res.end(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Proxy failed");
  }
});

app.use("/dashboard", express.static(ADMIN_PANEL_PATH));

app.get("/dashboard/{*splat}", (req, res) => {
  res.sendFile(path.join(ADMIN_PANEL_PATH, "index.html"));
});

mongoose.connect(process.env.MONGO_URI);

const port = process.env.PORT;

app.listen(port || 3001, "0.0.0.0", () => {
  console.log("Server running!!", port);
});

// ----------- Daily Scheduler (7AM - IST / 1AM - UTC) --------------

const runDailyAt7AM = () => {
  const now = new Date();

  const nextRun = new Date();
  nextRun.setHours(1, 30, 0, 0);

  // If it's already past 7 AM today, schedule for tomorrow
  if (now >= nextRun) {
    nextRun.setDate(nextRun.getDate() + 1);
    console.log("7am / 7pm job set");
  }

  const initialDelay = nextRun.getTime() - now.getTime();

  setTimeout(() => {
    const executeJob = async () => {
      try {
        await syncNewsFeed();
        // await YoutubeShorts();
        await InstagramPosts();
        await TwitterPosts();
        await creatorTrendScoreCalc();
      } catch (error) {
        console.error("syncNewsFeed error:", error);
      } finally {
        await cacheWarming();
      }
    };

    // Run immediately at 7 AM
    executeJob();

    // Then run every 12 hours
    setInterval(executeJob, 12 * 60 * 60 * 1000);
  }, initialDelay);
};

// ----------- Adaptive Boost Scheduler (1x/day, 9:30 UTC / 3PM IST) --------------
//
// Runs once a day, in between the two base runs above. It only rescrapes
// creators that were bumped to 3x/day by trackScrapeFrequency() (i.e. they
// hit the new-post threshold during a recent scrape). If nobody is
// currently boosted, runBoostScrape() is a cheap no-op.

const runBoostScrapeDaily = () => {
  const now = new Date();

  const nextRun = new Date();
  nextRun.setHours(9, 30, 0, 0);

  if (now >= nextRun) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const initialDelay = nextRun.getTime() - now.getTime();

  setTimeout(() => {
    const executeBoostJob = async () => {
      try {
        await runBoostScrape();
      } catch (error) {
        console.error("runBoostScrape error:", error);
      } finally {
        await cacheWarming();
      }
    };

    executeBoostJob();

    setInterval(executeBoostJob, 24 * 60 * 60 * 1000);
  }, initialDelay);
};

// ----------- Weekly Scheduler (7AM - IST / 1AM - UTC) --------------

const runEveryFridayAt7AM = () => {
  const now = new Date();

  const nextRun = new Date();
  nextRun.setHours(1, 30, 0, 0);

  // Calculate days until next Friday (Friday = 5)
  const daysUntilFriday = (5 - now.getDay() + 7) % 7;

  nextRun.setDate(now.getDate() + daysUntilFriday);

  // If it's already past 7 AM on Friday, schedule for next Friday
  if (daysUntilFriday === 0 && now >= nextRun) {
    nextRun.setDate(nextRun.getDate() + 7);
    console.log("7am / 7pm job set");
  }

  const initialDelay = nextRun.getTime() - now.getTime();

  setTimeout(() => {
    const executeWeeklyJob = async () => {
      try {
        await syncCreatorFollowers();
      } catch (error) {
        console.error("Weekly job error:", error);
      }
    };

    // Run at the scheduled Friday 7 AM
    executeWeeklyJob();

    // Then every 7 days
    setInterval(executeWeeklyJob, 7 * 24 * 60 * 60 * 1000);
  }, initialDelay);
};

// ----------- Instagram Media Cleanup Scheduler (once every 24h) --------------
//
// Locally-cached Instagram media (saved under public/cdn/instagram by
// mediaCDNWorker.js) older than 90 days is deleted from disk here. This does
// NOT touch public/cdn/images, which belongs to the separate CDN image
// gallery feature (src/controllers/cdnControls.js).

const runMediaCleanupDaily = () => {
  const executeCleanupJob = async () => {
    try {
      await cleanupOldInstagramMedia();
    } catch (error) {
      console.error("cleanupOldInstagramMedia error:", error);
    }
  };

  executeCleanupJob();

  setInterval(executeCleanupJob, 24 * 60 * 60 * 1000);
};

// ----------- function calls --------------

await scrapingConstantsCache(CACHING_KEYS.ScrapingConstantsKey);
// runDailyAt7AM();
// runBoostScrapeDaily();
// runEveryFridayAt7AM();
// runMediaCleanupDaily();

// ------Testing calls-------
// await syncNewsFeed();

// await YoutubeShorts();
// await InstagramPosts();
// await TwitterPosts();

// syncInstagramMedia().catch(console.error);
// await syncCreatorFollowers();
// await creatorTrendScoreCalc();

await cacheWarming();
