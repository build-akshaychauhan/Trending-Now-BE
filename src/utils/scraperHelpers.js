import { CREATOR_NAMES } from "../constants/keywords.js";
import SocialDumpStore from "../models/SocialDumpStore.js";
import SocialAllDump from "../models/SocialAllDump.js";

export const parseRelativeDate = (text) => {
  if (!text) return null;

  const value = text.toLowerCase().trim();

  const now = new Date();

  // JUST NOW
  if (value.includes("just now") || value.includes("few seconds")) {
    return now;
  }

  const match = value.match(
    /(\d+|a)\s+(second|minute|hour|day|week|month|year)/,
  );

  if (!match) return null;

  let amount = match[1] === "a" ? 1 : parseInt(match[1]);

  const unit = match[2];

  const date = new Date(now);

  switch (unit) {
    case "second":
      date.setSeconds(date.getSeconds() - amount);
      break;

    case "minute":
      date.setMinutes(date.getMinutes() - amount);
      break;

    case "hour":
      date.setHours(date.getHours() - amount);
      break;

    case "day":
      date.setDate(date.getDate() - amount);
      break;

    case "week":
      date.setDate(date.getDate() - amount * 7);
      break;

    case "month":
      date.setMonth(date.getMonth() - amount);
      break;

    case "year":
      date.setFullYear(date.getFullYear() - amount);
      break;
  }

  return date;
};

// NOTE: CREATOR_NAMES is loaded asynchronously from the DB (see
// loadScrapingConstants in constants/keywords.js) and is EMPTY at the
// moment this module is first imported. CREATOR_LOOKUP and `keywords`
// (below) used to be built once here with `.map()` / `.flatMap()`, so they
// permanently captured that empty snapshot and never reflected creators
// added later once the DB constants finished loading - every scraper that
// relied on them (getMatchedCreators, socialMediaScraper matching, twitter
// keyword search, etc.) silently matched/returned nothing for real
// creators. Fixed by computing them fresh on every call via a function
// instead of once at import time.
export function getCreatorLookup() {
  return CREATOR_NAMES.map((creator) => ({
    ...creator,
    allKeywords: [
      creator.name.replace(/_/g, " ").toLowerCase(),
      ...(creator.keywords || []).map((k) => k.toLowerCase()),
    ],
  }));
}

export function createCreatorCache() {
  const cache = {};

  for (const creator of CREATOR_NAMES) {
    cache[creator.name] = {
      creator: creator.name,
      channelName: creator.channelName,
      totalPosts: 0,
      data: [],
      seenPosts: new Set(),
    };
  }

  return cache;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getTwitterKeywords() {
  return [
    ...new Set(
      CREATOR_NAMES.flatMap((creator) => creator.twitterKeyword || []),
    ),
  ].map((k) => encodeURIComponent(k));
}

export function getMatchedCreators(
  text = "",
  creatorLookup = getCreatorLookup(),
) {
  const searchableText = text
    .toLowerCase()
    .replace(/[#_]/g, "")
    .replace(/\s+/g, "");

  return creatorLookup
    .filter((creator) =>
      creator.allKeywords.some((keyword) =>
        searchableText.includes(
          keyword.toLowerCase().replace(/[#_]/g, "").replace(/\s+/g, ""),
        ),
      ),
    )
    .map((creator) => creator.name);
}

// ==========================
// ADAPTIVE SCRAPE FREQUENCY
// ==========================
//
// Default: every creator is scraped 2x/day (the normal scheduled runs).
// If a scrape run finds >= SCRAPE_THRESHOLD_POSTS new posts for a creator
// on a given day, that creator is "boosted" to 3x/day (an extra run is
// added for them). If, while boosted, the creator stays below the
// threshold for REVERT_STREAK_DAYS consecutive full days, it's reverted
// back to 2x/day.

export const SCRAPE_THRESHOLD_POSTS = 15;
export const DEFAULT_TIMES_PER_DAY = 2;
export const BOOSTED_TIMES_PER_DAY = 3;
export const REVERT_STREAK_DAYS = 2;

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function getPostKey(post) {
  return (
    post?.postId ||
    post?.tweetId ||
    post?.shortId ||
    post?.postUrl ||
    post?.url ||
    JSON.stringify(post)
  );
}

export async function trackScrapeFrequency(creatorName, newPostsCountToday) {
  if (!creatorName || creatorName === "__system__") return;

  const today = todayKey();

  const dumpStore = await SocialDumpStore.findOneAndUpdate(
    { creatorName },
    { $setOnInsert: { creatorName } },
    { upsert: true, returnDocument: "after" },
  );

  const freq = dumpStore.scrapeFrequency || {};

  let timesPerDay = freq.timesPerDay ?? DEFAULT_TIMES_PER_DAY;
  let dailyNewPostsCount = freq.dailyNewPostsCount ?? 0;
  let trackingDate = freq.trackingDate ?? null;
  let belowThresholdDays = freq.belowThresholdDays ?? 0;
  let lastBoostedAt = freq.lastBoostedAt ?? null;

  // Rolled over into a new day -> close out the previous tracking day first
  if (trackingDate && trackingDate !== today) {
    if (timesPerDay === BOOSTED_TIMES_PER_DAY) {
      if (dailyNewPostsCount >= SCRAPE_THRESHOLD_POSTS) {
        belowThresholdDays = 0;
      } else {
        belowThresholdDays += 1;
      }

      if (belowThresholdDays >= REVERT_STREAK_DAYS) {
        timesPerDay = DEFAULT_TIMES_PER_DAY;
        belowThresholdDays = 0;
      }
    }

    dailyNewPostsCount = 0;
  }

  dailyNewPostsCount += newPostsCountToday || 0;
  trackingDate = today;

  if (
    dailyNewPostsCount >= SCRAPE_THRESHOLD_POSTS &&
    timesPerDay !== BOOSTED_TIMES_PER_DAY
  ) {
    timesPerDay = BOOSTED_TIMES_PER_DAY;
    belowThresholdDays = 0;
    lastBoostedAt = new Date();
  }

  await SocialDumpStore.updateOne(
    { creatorName },
    {
      $set: {
        "scrapeFrequency.timesPerDay": timesPerDay,
        "scrapeFrequency.dailyNewPostsCount": dailyNewPostsCount,
        "scrapeFrequency.trackingDate": trackingDate,
        "scrapeFrequency.belowThresholdDays": belowThresholdDays,
        "scrapeFrequency.lastBoostedAt": lastBoostedAt,
        "scrapeFrequency.lastUpdatedAt": new Date(),
      },
    },
  );
}

export async function getBoostedCreatorNames() {
  const boosted = await SocialDumpStore.find({
    "scrapeFrequency.timesPerDay": BOOSTED_TIMES_PER_DAY,
  })
    .select("creatorName")
    .lean();

  return boosted.map((c) => c.creatorName).filter(Boolean);
}

export function extractMedia(tweet) {
  const media = [];

  if (!tweet.media) return media;

  if (tweet.media.photo) {
    tweet.media.photo.forEach((p) => {
      media.push({
        type: "photo",
        url: p.media_url_https,
      });
    });
  }

  if (tweet.media.video) {
    tweet.media.video.forEach((v) => {
      const bestMp4 = v.variants
        ?.filter((x) => x.content_type === "video/mp4")
        ?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

      media.push({
        type: "video",
        thumbnail: v.media_url_https,
        url: bestMp4?.url || "",
      });
    });
  }

  return media;
}

const BOOTSTRAP_RANGE_DAYS = 90;

// Per-creator, per-platform bootstrap + rangeDate resolution.
//
// Previously this read/wrote a single shared "__system__" document, so the
// FIRST creator to finish bootstrapping a platform flipped that flag
// globally — every creator added afterwards (even brand new ones) was
// treated as already-bootstrapped and only ever got a 1-day lookback
// instead of the intended 90-day history pull.
//
// Fix: bootstrap status lives on each creator's own SocialDumpStore doc.
// Returns:
//   - rangeDate: the WIDEST cutoff needed across the given creators (used
//     to decide how far back a shared crawl/pagination/keyword-search needs
//     to go so it doesn't miss a newly-added creator's 90-day history).
//   - creatorCutoffs: Map<creatorName, Date> — each creator's OWN cutoff,
//     used to filter matched posts per-creator so already-bootstrapped
//     creators don't get flooded with old backlog just because a sibling
//     creator needed a 90-day pull in the same run.
export async function getPlatformScrapeConfig(
  platform,
  creatorNames = CREATOR_NAMES.map((c) => c.name),
) {
  const bootstrapCutoff = new Date(
    Date.now() - BOOTSTRAP_RANGE_DAYS * 24 * 60 * 60 * 1000,
  );

  const normalCutoff = new Date();
  normalCutoff.setDate(normalCutoff.getDate() - 1);

  const docs = await SocialDumpStore.find({
    creatorName: { $in: creatorNames },
  })
    .select(`creatorName platformState.${platform}`)
    .lean();

  const stateByCreator = new Map(
    docs.map((d) => [d.creatorName, d.platformState?.[platform]]),
  );

  const creatorCutoffs = new Map();

  let isBootstrap = false;
  let rangeDate = normalCutoff;

  for (const name of creatorNames) {
    const state = stateByCreator.get(name);
    const needsBootstrap = !state?.bootstrapCompleted;

    const cutoff = needsBootstrap ? bootstrapCutoff : normalCutoff;

    creatorCutoffs.set(name, cutoff);

    // Log the resolved date range per creator so it's clear from the logs
    // whether a creator got the 90-day bootstrap pull or the normal 1-day
    // lookback, and why (no dumpstore doc yet vs bootstrapCompleted=false
    // vs already bootstrapped).
    const reason = !state
      ? "no dumpstore doc yet"
      : !state.bootstrapCompleted
        ? "bootstrapCompleted=false"
        : "bootstrapCompleted=true";

    console.log(
      `[scrapeConfig] platform=${platform} creator=${name} ` +
        `range=${needsBootstrap ? `${BOOTSTRAP_RANGE_DAYS}d` : "1d"} ` +
        `since=${cutoff.toISOString()} reason="${reason}"`,
    );

    if (needsBootstrap) {
      isBootstrap = true;
      rangeDate = bootstrapCutoff;
    }
  }

  console.log(
    `[scrapeConfig] platform=${platform} overall isBootstrap=${isBootstrap} ` +
      `widestRangeDate=${rangeDate.toISOString()} creators=${creatorNames.length}`,
  );

  return {
    isBootstrap,
    rangeDate,
    creatorCutoffs,
  };
}

function groupPostsByDay(posts) {
  const grouped = {};

  for (const post of posts || []) {
    const date = post.time || post.createdAt || post.publishDate;

    if (!date) continue;

    const day = new Date(date).toISOString().split("T")[0];

    if (!grouped[day]) {
      grouped[day] = [];
    }

    grouped[day].push(post);
  }

  return grouped;
}

export async function savePlatformData({ creatorName, platform, posts }) {
  let dumpStore = await SocialDumpStore.findOne({
    creatorName,
  });

  if (!dumpStore) {
    dumpStore = await SocialDumpStore.create({
      creatorName,
      instaFCount: 0,
      youtubeFCount: null,
    });
  }

  if (!posts?.length) {
    await SocialDumpStore.updateOne(
      {
        creatorName,
      },
      {
        $set: {
          [`platformState.${platform}.bootstrapCompleted`]: true,

          [`platformState.${platform}.lastScrapedAt`]: new Date(),
        },
      },
      {
        upsert: true,
      },
    );

    return;
  }

  const groupedPosts = groupPostsByDay(posts);

  const today = todayKey();

  let newPostsToday = 0;

  for (const [day, dayPosts] of Object.entries(groupedPosts)) {
    const scrapeDate = new Date(day);

    const expireAt = new Date(scrapeDate);

    expireAt.setMonth(expireAt.getMonth() + 3);

    const existing = await SocialAllDump.findOne({
      creatorName,
      scrapeDate,
    });

    if (!existing) {
      await SocialAllDump.create({
        creatorName,

        dumpStoreId: dumpStore._id,

        scrapeDate,

        [platform]: dayPosts,

        expireAt,
      });

      if (day === today) {
        newPostsToday += dayPosts.length;
      }
    } else {
      if (day === today) {
        const existingKeys = new Set(
          (existing[platform] || []).map((p) => getPostKey(p)),
        );

        newPostsToday += dayPosts.filter(
          (p) => !existingKeys.has(getPostKey(p)),
        ).length;
      }

      await SocialAllDump.updateOne(
        {
          _id: existing._id,
        },
        {
          $addToSet: {
            [platform]: {
              $each: dayPosts,
            },
          },
        },
      );
    }
  }

  const latestPostDate =
    posts?.length > 0
      ? new Date(
          Math.max(
            ...posts.map((x) =>
              new Date(x.time || x.createdAt || x.publishDate).getTime(),
            ),
          ),
        )
      : null;

  await SocialDumpStore.updateOne(
    {
      creatorName,
    },
    {
      $set: {
        [`platformState.${platform}.bootstrapCompleted`]: true,

        [`platformState.${platform}.lastScrapedAt`]: new Date(),

        [`platformState.${platform}.latestPostDate`]: latestPostDate,
      },
    },
    {
      upsert: true,
    },
  );

  // Adaptive per-creator scrape frequency: only "today's" newly discovered
  // posts count towards the threshold (backfilled/older days are ignored).
  await trackScrapeFrequency(creatorName, newPostsToday);
}

export const blockResources = async (page) => {
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();

    if (
      ["image", "media", "font"].includes(type) ||
      url.includes("googlevideo.com") ||
      url.includes("i.ytimg.com")
    ) {
      return route.abort();
    }

    return route.continue();
  });
};

// ==========================
// GET YOUTUBE CHANNEL INFO
// ==========================

export async function getYoutubeChannelInfo(channelHandle) {
  try {
    const cleanHandle = channelHandle.replace("@", "").replace(/\s+/g, "");

    const { data } = await axios.get(
      `https://www.youtube.com/@${cleanHandle}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        timeout: 10000,
      },
    );

    const channelIdMatch =
      data.match(/"channelId":"(UC[^"]+)"/) ||
      data.match(/"externalId":"(UC[^"]+)"/) ||
      data.match(/https:\\\/\\\/www\.youtube\.com\\\/channel\\\/(UC[^\\"]+)/);

    const avatarMatch = data.match(/"avatar":\{"thumbnails":\[(.*?)\]\}/);

    let avatar = null;

    if (avatarMatch?.[1]) {
      const urls = [...avatarMatch[1].matchAll(/"url":"([^"]+)"/g)];

      if (urls.length) {
        avatar = urls[urls.length - 1][1];

        avatar = avatar.replace(/\\u0026/g, "&");

        avatar = avatar.replace(/=s\d+[^-]*/, "=s800");
      }
    }

    return {
      channelId: channelIdMatch?.[1] || null,
      avatar,
    };
  } catch (error) {
    console.log("channel info failed:", channelHandle);

    return {
      channelId: null,
      avatar: null,
    };
  }
}

// ==========================
// GET RSS VIDEO
// ==========================

export async function getLatestYoutubeVideo(channelId) {
  try {
    if (!channelId) return null;

    const { data } = await axios.get(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      {
        timeout: 10000,
      },
    );

    const videoIdMatch = data.match(/<yt:videoId>(.*?)<\/yt:videoId>/);

    const titleMatch = data.match(/<entry>[\s\S]*?<title>(.*?)<\/title>/);

    const publishedMatch = data.match(/<published>(.*?)<\/published>/);

    if (!videoIdMatch?.[1]) return null;

    const videoId = videoIdMatch[1];

    return {
      videoId,

      title: titleMatch?.[1] || "",

      publishedAt: publishedMatch?.[1] || "",

      url: `https://www.youtube.com/watch?v=${videoId}`,

      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch (error) {
    console.log("rss failed:", channelId);

    return null;
  }
}

export function toUsername(channel) {
  if (channel.startsWith("http")) {
    const match = channel.match(/@([^/?]+)/);
    return match ? match[1] : channel;
  }
  return channel.startsWith("@") ? channel.slice(1) : channel;
}
