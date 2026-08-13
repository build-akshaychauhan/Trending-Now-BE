import * as cheerio from "cheerio";
import { chromium } from "playwright";
import dotenv from "dotenv";
import { containsUsername } from "../utils/creatorNameRegex.js";
import {
  CREATOR_NAMES,
  INSTA_ACCOUNTS,
  YT_CHANNELS,
} from "../constants/keywords.js";
import {
  blockResources,
  createCreatorCache,
  getCreatorLookup,
  extractMedia,
  getBoostedCreatorNames,
  getLatestYoutubeVideo,
  getMatchedCreators,
  getPlatformScrapeConfig,
  getYoutubeChannelInfo,
  getTwitterKeywords,
  savePlatformData,
  sleep,
  toUsername,
} from "../utils/scraperHelpers.js";
import { syncInstagramMedia } from "../utils/mediaCDNWorker.js";
import SocialDumpStore from "../models/SocialDumpStore.js";
import Creator from "../models/Creator.js";
import ArticleStore from "../models/ArticleStore.js";
import SocialAllDump from "../models/SocialAllDump.js";

dotenv.config();

//  creator instagram posts caching
let creatorCache = createCreatorCache();

function resetCreatorCache() {
  creatorCache = createCreatorCache();
}

// dynamic api key swapping
const RAPIDAPI_KEYS = [
  process.env.RAPID_API_KEY1,
  process.env.RAPID_API_KEY2,
  process.env.RAPID_API_KEY3,
  process.env.RAPID_API_KEY4,
  process.env.RAPID_API_KEY5,
  process.env.RAPID_API_KEY6,
  process.env.RAPID_API_KEY7,
  process.env.RAPID_API_KEY8,
  process.env.RAPID_API_KEY9,
  process.env.RAPID_API_KEY10,
].filter(Boolean);

async function rapidApiFetch(url, options = {}) {
  let lastError;

  for (const [index, apiKey] of RAPIDAPI_KEYS.entries()) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          "x-rapidapi-key": apiKey,
        },
      });

      if (response.status === 429) {
        console.log(`Key ${index + 1} rate limited`);
        continue;
      }

      if (response.status >= 500) {
        console.log(`Provider error ${response.status}`);
        continue;
      }

      if (response.status === 403) {
        const clone = response.clone();
        const text = await clone.text();

        if (
          text.toLowerCase().includes("quota") ||
          text.toLowerCase().includes("limit") ||
          text.toLowerCase().includes("exceeded")
        ) {
          console.log(`Key ${index + 1} quota exceeded`);
          continue;
        }
      }

      return response;
    } catch (err) {
      lastError = err;
      console.log(`Key ${index + 1} failed: ${err.message}`);

      await sleep(1000);
    }
  }

  throw lastError || new Error("All RapidAPI keys exhausted");
}

// ─── INSTAGRAM: profile posts ────────────────────────────────────────────────

export function processItems({
  edges = [],
  scannedIds,
  matchedPosts,
  creatorLookup,
  rangeDate,
  creatorCutoffs,
  username,
}) {
  let scannedCount = 0;
  let reachedDateLimit = false;

  for (const edge of edges) {
    const item = edge?.node;

    if (!item?.id) continue;

    if (scannedIds.has(item.id)) continue;

    scannedIds.add(item.id);

    scannedCount++;

    const postDate = new Date(item.taken_at * 1000);

    if (postDate < rangeDate) {
      reachedDateLimit = true;
      break;
    }

    const caption = item?.caption?.text || "";

    const hashtags = caption.match(/#\w+/g) || [];

    const searchableText = `${caption} ${hashtags.join(" ")}`
      .toLowerCase()
      .replace(/[#_]/g, "")
      .replace(/\s+/g, "");

    const matchedCreators = creatorLookup
      .filter((creator) =>
        creator.allKeywords.some((keyword) =>
          searchableText.includes(
            keyword.toLowerCase().replace(/[#_]/g, "").replace(/\s+/g, ""),
          ),
        ),
      )
      .map((creator) => creator.name)
      // Each creator has its own cutoff (90 days if newly added & not yet
      // bootstrapped, 1 day otherwise) — don't let an already-bootstrapped
      // creator get flooded with old backlog just because this same crawl
      // had to go back further for a sibling creator.
      .filter((name) => {
        const cutoff = creatorCutoffs?.get(name);
        return !cutoff || postDate >= cutoff;
      });

    if (!matchedCreators.length) {
      continue;
    }

    const media = [];

    // Reel
    if (item.video_versions?.length) {
      media.push({
        type: "video",
        url: item.video_versions[0].url,
        poster: item.image_versions2?.candidates?.[0]?.url || null,
        firebaseUrl: null,
        firebasePoster: null,
        uploadedAt: null,
      });
    }

    // Carousel
    else if (item.carousel_media?.length) {
      for (const mediaItem of item.carousel_media) {
        const videoUrl = mediaItem.video_versions?.[0]?.url;

        const imageUrl = mediaItem.image_versions2?.candidates?.[0]?.url;

        media.push({
          type: videoUrl ? "video" : "image",
          url: videoUrl || imageUrl,
          poster: imageUrl || null,
          firebaseUrl: null,
          firebasePoster: null,
          uploadedAt: null,
        });
      }
    }

    // Single Image
    else {
      const imageUrl = item.image_versions2?.candidates?.[0]?.url;

      if (imageUrl) {
        media.push({
          type: "image",
          url: imageUrl,
          firebaseUrl: null,
          uploadedAt: null,
        });
      }
    }

    const post = {
      creators: matchedCreators,

      shortcode: item.code,

      postId: item.id,

      postUrl: `https://www.instagram.com/p/${item.code}/`,

      username,

      ownerId: item.owner?.id || null,

      caption,

      hashtags,

      time: postDate.toISOString(),

      unixDate: item.taken_at,

      likeCount: item.like_count || 0,

      commentCount: item.comment_count || 0,

      isVideo: item.video_versions?.length > 0,

      isSidecar: item.carousel_media?.length > 0,

      thumbnail: item.image_versions2?.candidates?.[0]?.url || null,

      mediaCount: media.length,

      media,
    };

    matchedPosts.push(post);

    for (const creatorName of matchedCreators) {
      const bucket = creatorCache[creatorName];

      if (!bucket) continue;

      if (bucket.seenPosts.has(post.postId)) {
        continue;
      }

      bucket.seenPosts.add(post.postId);

      bucket.data.push(post);

      bucket.totalPosts++;
    }
  }

  return {
    scannedCount,
    reachedDateLimit,
  };
}

export async function fetchInstagramPosts(username, maxId = null) {
  const body = { username };

  if (maxId) {
    body.maxId = maxId;
  }
  const url = "https://instagram120.p.rapidapi.com/api/instagram/posts";

  const response = await rapidApiFetch(url, {
    method: "POST",
    headers: {
      "x-rapidapi-host": "instagram120.p.rapidapi.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`RapidAPI Error ${response.status}`);
  }

  return response.json();
}

export async function scrapeInstagramAccount({
  username,
  creatorLookup,
  rangeDate,
  creatorCutoffs,
}) {
  const scannedIds = new Set();

  const matchedPosts = [];

  const MAX_PAGES_PER_ACCOUNT = 15;

  let totalScanned = 0;

  let maxId = null;

  let hasNextPage = true;

  let reachedDateLimit = false;

  let pageNumber = 1;

  let stopReason = null;

  while (
    hasNextPage &&
    !reachedDateLimit &&
    pageNumber <= MAX_PAGES_PER_ACCOUNT
  ) {
    console.log(`[${username}] Fetch Page ${pageNumber}`);

    let json;

    try {
      json = await fetchInstagramPosts(username, maxId);
    } catch (e) {
      console.log(`[${username}] fetch failed`, e.message);
      break;
    }

    const edges = json?.result?.edges || [];

    if (!edges.length) {
      break;
    }

    const processed = processItems({
      edges,
      scannedIds,
      matchedPosts,
      creatorLookup,
      rangeDate,
      creatorCutoffs,
      username,
    });

    totalScanned += processed.scannedCount;

    reachedDateLimit = processed.reachedDateLimit;

    const pageInfo = json?.result?.page_info || {};

    hasNextPage = pageInfo.has_next_page === true;

    maxId = pageInfo.end_cursor || null;

    console.log({
      username,
      pageNumber,
      pagePosts: edges.length,
      totalScanned,
      matchedPosts: matchedPosts.length,
      hasNextPage,
      maxId,
      reachedDateLimit,
    });

    pageNumber++;

    if (!hasNextPage || !maxId) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (reachedDateLimit) {
    stopReason = "date_limit";
  } else if (pageNumber > MAX_PAGES_PER_ACCOUNT) {
    stopReason = "page_limit";
  } else if (!hasNextPage) {
    stopReason = "no_more_pages";
  }

  return {
    username,
    scrapedAt: new Date(),
    scannedPosts: totalScanned,
    totalPosts: matchedPosts.length,
    stopReason,
    data: matchedPosts,
  };
}

export const InstagramPosts = async ({ onlyCreators = null } = {}) => {
  try {
    // Reset cache for every fresh scrape
    resetCreatorCache();

    const accounts = INSTA_ACCOUNTS;

    if (!Array.isArray(accounts) || !accounts.length) {
      return {
        success: false,
        error: "accounts array required",
      };
    }

    // When running a targeted "boost" scrape for a subset of creators,
    // only match against those creators' keywords so unrelated creators
    // aren't touched by this extra run.
    const allCreatorLookup = getCreatorLookup();
    const creatorLookup =
      Array.isArray(onlyCreators) && onlyCreators.length
        ? allCreatorLookup.filter((c) => onlyCreators.includes(c.name))
        : allCreatorLookup;

    // ----------------------------------------------------
    // LAST 3 MONTHS
    // ----------------------------------------------------

    const allInstagramData = [];

    // ----------------------------------------------------
    // PARALLEL ACCOUNT BATCHES
    // ----------------------------------------------------

    const BATCH_SIZE = 2;

    const instagramConfig = await getPlatformScrapeConfig(
      "instagram",
      creatorLookup.map((c) => c.name),
    );

    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      const batch = accounts.slice(i, i + BATCH_SIZE);

      console.log(
        `Starting batch ${batchNumber} / ${Math.ceil(accounts.length / BATCH_SIZE)}`,
      );

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const batchResults = await Promise.allSettled(
        batch.map(async (account) => {
          return scrapeInstagramAccount({
            username: account.username,
            creatorLookup,
            rangeDate: instagramConfig.rangeDate,
            creatorCutoffs: instagramConfig.creatorCutoffs,
          });
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];

        const account = batch[j];

        if (result.status === "fulfilled") {
          allInstagramData.push(result.value);
        } else {
          allInstagramData.push({
            username: account.username,
            error: result.reason?.message || "Unknown error",
          });
        }
      }

      console.log(`Completed batch ${batchNumber}`);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    const creatorResults = Object.values(creatorCache).map((creator) => ({
      ...creator,
      seenPosts: undefined,
    }));

    for (const creator of creatorResults) {
      if (
        Array.isArray(onlyCreators) &&
        onlyCreators.length &&
        !onlyCreators.includes(creator.creator)
      ) {
        continue;
      }

      await savePlatformData({
        creatorName: creator.creator,
        platform: "instagram",
        posts: creator.data,
      });
    }

    const res = {
      success: true,
      totalAccounts: allInstagramData.length,
      totalCreators: CREATOR_NAMES.length,
      data: creatorResults,
    };

    setImmediate(() => {
      syncInstagramMedia().catch(console.error);
    });

    return res;
  } catch (e) {
    console.log(e);

    return {
      success: false,
      partial: true,
      error: e.message,

      totalCreators: CREATOR_NAMES.length,

      data: Object.values(creatorCache).map((creator) => ({
        ...creator,
        seenPosts: undefined,
      })),
    };
  }
};

// ─── Twitter: posts ────────────────────────────────────────────────

export const TwitterPosts = async ({ onlyCreators = null } = {}) => {
  try {
    const uniqueIds = new Set();
    const posts = [];

    const isBoostRun = Array.isArray(onlyCreators) && onlyCreators.length;

    // Targeted boost run -> only search keywords/match against the
    // boosted creators so unrelated creators aren't touched.
    const fullCreatorLookup = getCreatorLookup();
    const creatorLookup = isBoostRun
      ? fullCreatorLookup.filter((c) => onlyCreators.includes(c.name))
      : fullCreatorLookup;

    const twitterConfig = await getPlatformScrapeConfig(
      "twitter",
      creatorLookup.map((c) => c.name),
    );

    const rangeDate = twitterConfig.rangeDate;

    const creatorCutoffs = twitterConfig.creatorCutoffs;

    const searchKeywords = isBoostRun
      ? [
          ...new Set(
            CREATOR_NAMES.filter((c) => onlyCreators.includes(c.name)).flatMap(
              (c) => c.twitterKeyword || [],
            ),
          ),
        ].map((k) => encodeURIComponent(k))
      : getTwitterKeywords();

    for (const keyword of searchKeywords) {
      try {
        console.log(`Searching: ${keyword}`);

        const url = `https://twitter-api45.p.rapidapi.com/search.php?query=${encodeURIComponent(keyword)}&search_type=Top`;

        const response = await rapidApiFetch(url, {
          method: "GET",
          headers: {
            "x-rapidapi-host": "twitter-api45.p.rapidapi.com",
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();

          console.error(
            `Search error for "${keyword}"`,
            response.status,
            errorText,
          );

          if (response.status === 429) {
            console.log("Rate limited. Waiting 30 seconds...");
            await sleep(30000);
          } else {
            await sleep(3000);
          }

          continue;
        }

        const data = await response.json();

        const tweets = (data.timeline || []).filter(
          (item) => item.type === "tweet",
        );

        console.log(`"${keyword}" => ${tweets.length} tweets`);

        for (const tweet of tweets) {
          const tweetId = tweet.tweet_id;

          if (!tweetId) continue;

          if (uniqueIds.has(tweetId)) continue;

          uniqueIds.add(tweetId);

          if (new Date(tweet.created_at) < rangeDate) {
            continue;
          }

          const tweetDate = new Date(tweet.created_at);

          const matchedCreators = getMatchedCreators(
            tweet.text || "",
            creatorLookup,
          ).filter((name) => {
            const cutoff = creatorCutoffs?.get(name);
            return !cutoff || tweetDate >= cutoff;
          });

          if (!matchedCreators.length) {
            continue;
          }

          const media = extractMedia(tweet);

          if (!media || media.length === 0) {
            continue;
          }

          posts.push({
            creators: matchedCreators,

            tweetId,

            matchedKeyword: keyword,

            username: tweet.screen_name || tweet.user_info?.screen_name || "",

            name: tweet.user_info?.name || "",

            text: tweet.text || "",

            createdAt: tweet.created_at,

            likes: tweet.favorites || 0,

            quotes: tweet.quotes || 0,

            views: Number(tweet.views || 0),

            bookmarks: tweet.bookmarks || 0,

            lang: tweet.lang || "",

            media,

            mediaCount: media.length,

            avatar: tweet.user_info?.avatar || "",

            followers: tweet.user_info?.followers_count || 0,

            verified: tweet.user_info?.verified || false,

            location: tweet.user_info?.location || "",

            url: `https://x.com/${tweet.screen_name}/status/${tweetId}`,
          });
        }

        await sleep(2000);
      } catch (err) {
        console.error(`Keyword failed: ${keyword}`, err.message);

        await sleep(5000);
      }
    }

    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const creatorResults = {};

    const relevantCreators = isBoostRun
      ? CREATOR_NAMES.filter((c) => onlyCreators.includes(c.name))
      : CREATOR_NAMES;

    for (const creator of relevantCreators) {
      creatorResults[creator.name] = {
        creator: creator.name,
        channelName: creator.channelName,
        totalPosts: 0,
        data: [],
      };
    }

    for (const post of posts) {
      for (const creatorName of post.creators || []) {
        if (!creatorResults[creatorName]) continue;

        creatorResults[creatorName].data.push(post);
        creatorResults[creatorName].totalPosts++;
      }
    }

    const creatorArray = Object.values(creatorResults);

    for (const creator of creatorArray) {
      await savePlatformData({
        creatorName: creator.creator,
        platform: "twitter",
        posts: creator.data,
      });
    }

    return {
      success: true,
      keywordsProcessed: searchKeywords.length,
      totalMatches: posts.length,
      totalCreators: relevantCreators.length,
      data: creatorArray,
    };
  } catch (error) {
    console.error(error);

    return {
      success: false,
      error: error.message,
    };
  }
};

// ─── ADAPTIVE BOOST SCRAPE: extra 3rd run for creators over threshold ────────
//
// Runs on top of the normal 2x/day schedule. Only touches creators whose
// SocialDumpStore.scrapeFrequency.timesPerDay === 3 (set automatically by
// trackScrapeFrequency() inside savePlatformData whenever a creator hits
// SCRAPE_THRESHOLD_POSTS new posts in a day). If no creator is currently
// boosted, this is a cheap no-op.
export const runBoostScrape = async () => {
  try {
    const boostedCreators = await getBoostedCreatorNames();

    if (!boostedCreators.length) {
      console.log("Boost scrape: no creators currently boosted, skipping.");

      return {
        success: true,
        skipped: true,
        boostedCreators: [],
      };
    }

    console.log("Boost scrape running for:", boostedCreators);

    const [instagramResult, twitterResult] = await Promise.allSettled([
      InstagramPosts({ onlyCreators: boostedCreators }),
      TwitterPosts({ onlyCreators: boostedCreators }),
    ]);

    return {
      success: true,
      boostedCreators,
      instagram:
        instagramResult.status === "fulfilled"
          ? instagramResult.value
          : { success: false, error: instagramResult.reason?.message },
      twitter:
        twitterResult.status === "fulfilled"
          ? twitterResult.value
          : { success: false, error: twitterResult.reason?.message },
    };
  } catch (err) {
    console.log("Boost scrape failed", err);

    return {
      success: false,
      error: err.message,
    };
  }
};

// ─── YOUTUBE: channel shorts ────────────────────────────────────────

async function fetchShortsPage(username, continuationToken) {
  const url = new URL(
    `https://youtube-media-downloader9.p.rapidapi.com/channel/shorts`,
  );
  url.searchParams.set("username", username);
  url.searchParams.set("lang", "en");
  url.searchParams.set("geo", "IN");

  if (continuationToken) {
    url.searchParams.set("continuation", continuationToken);
  }

  const response = await rapidApiFetch(url.toString(), {
    method: "GET",
    headers: {
      "x-rapidapi-host": "youtube-media-downloader9.p.rapidapi.com",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Shorts API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

async function fetchVideoPublishDate(videoId) {
  try {
    const url = `https://youtube-v2.p.rapidapi.com/video/details?video_id=${videoId}`;

    const response = await rapidApiFetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "youtube-v2.p.rapidapi.com",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();

    return data?.published_time || null;
  } catch (err) {
    console.log("fetchVideoPublishDate error:", err.message);
    return null;
  }
}

export const YoutubeShorts = async () => {
  // const { channels } = req.body;

  const channels = YT_CHANNELS;
  const fullCreatorLookup = getCreatorLookup();

  resetCreatorCache();

  if (!Array.isArray(channels) || channels.length === 0) {
    return {
      success: false,
      error: "channels array required",
    };
  }

  try {
    const toDate = new Date();

    const config = await getPlatformScrapeConfig("youtubeShorts");

    const fromDate = config.rangeDate;

    const creatorCutoffs = config.creatorCutoffs;

    console.log(
      `Filtering Shorts from ${fromDate.toISOString()} to ${toDate.toISOString()}`,
    );

    for (const channel of channels) {
      try {
        const username = toUsername(channel);

        console.log("Fetching shorts for:", username);

        const processedUrls = new Set();
        const matchingShorts = [];

        // Track which creators got NEW shorts from THIS channel, so we can
        // save/append right after this channel finishes.
        const channelPostsByCreator = {};

        let continuationToken = undefined;
        let stopPaging = false;

        let pageCount = 0;
        const MAX_PAGES = 2; // mirrors MAX_SCROLLS

        let noKeywordMatchPages = 0;
        const MAX_NO_MATCH_PAGES = 2; // mirrors MAX_NO_MATCH_SCROLLS

        while (!stopPaging && pageCount < MAX_PAGES) {
          pageCount++;

          console.log(`${channel}: Page ${pageCount}/${MAX_PAGES}`);

          console.log(
            `Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
          );

          let pageData;

          try {
            pageData = await fetchShortsPage(username, continuationToken);
          } catch (err) {
            console.log(`${channel}: API fetch error -`, err.message);
            break;
          }

          const items = Array.isArray(pageData?.data) ? pageData.data : [];

          // SAME LOGIC AS YoutubeShort (via title/caption keyword match)
          const discoveredShorts = items
            .filter((item) => item?.type === "shorts" && item?.videoId)
            .map((item) => ({
              url: `https://www.youtube.com/shorts/${item.videoId}`,
              caption: (item.title || "").trim(),
              videoId: item.videoId,
            }));

          const newShorts = discoveredShorts.filter(
            (x) => !processedUrls.has(x.url),
          );

          if (!newShorts.length) {
            console.log(`${channel}: No new shorts found on this page`);
          }

          // mark all as processed
          newShorts.forEach((short) => {
            processedUrls.add(short.url);
          });

          // only keep keyword matching shorts
          const keywordMatchedShorts = newShorts.filter((short) => {
            const caption = (short.caption || "").trim().toLowerCase();

            if (!caption) return false;

            return fullCreatorLookup.some((creator) =>
              creator.allKeywords.some((keyword) => caption.includes(keyword)),
            );
          });

          if (keywordMatchedShorts.length === 0) {
            noKeywordMatchPages++;

            console.log(
              `${channel}: No keyword matches (${noKeywordMatchPages}/${MAX_NO_MATCH_PAGES})`,
            );
          } else {
            noKeywordMatchPages = 0;
          }

          if (noKeywordMatchPages >= MAX_NO_MATCH_PAGES) {
            console.log(
              `${channel}: No keyword matches found after ${MAX_NO_MATCH_PAGES} consecutive pages. Skipping channel.`,
            );

            break;
          }

          continuationToken = pageData?.continuation;

          if (!keywordMatchedShorts.length) {
            if (!continuationToken) {
              console.log(`${channel}: No more pages available`);
              break;
            }
            continue;
          }

          console.log(
            `${channel}: ${newShorts.length} new shorts, ${keywordMatchedShorts.length} keyword matches`,
          );

          let oldShortsCount = 0;

          for (const short of keywordMatchedShorts) {
            try {
              const publishDate = await fetchVideoPublishDate(short.videoId);

              if (!publishDate) {
                continue;
              }

              const shortDate = new Date(publishDate);

              if (shortDate < fromDate) {
                oldShortsCount++;
              }

              const caption = (short.caption || "").toLowerCase();

              const matchedCreators = fullCreatorLookup
                .filter((creator) =>
                  creator.allKeywords.some((keyword) =>
                    caption.includes(keyword),
                  ),
                )
                .map((creator) => creator.name)
                .filter((name) => {
                  const cutoff = creatorCutoffs?.get(name);
                  return !cutoff || shortDate >= cutoff;
                });

              if (!matchedCreators.length) {
                continue;
              }

              if (shortDate >= fromDate && shortDate <= toDate) {
                const shortData = {
                  creators: matchedCreators,
                  url: short.url,
                  shortId: short.videoId,
                  caption: short.caption,
                  publishDate,
                  channel,
                };

                matchingShorts.push(shortData);

                for (const creatorName of matchedCreators) {
                  const bucket = creatorCache[creatorName];

                  if (!bucket) continue;

                  if (!bucket.seenPosts) {
                    bucket.seenPosts = new Set();
                  }

                  if (bucket.seenPosts.has(short.url)) {
                    continue;
                  }

                  bucket.seenPosts.add(short.url);

                  bucket.data.push(shortData);

                  bucket.totalPosts++;

                  // stage this post for the per-channel save below
                  if (!channelPostsByCreator[creatorName]) {
                    channelPostsByCreator[creatorName] = [];
                  }
                  channelPostsByCreator[creatorName].push(shortData);
                }
              }
            } catch (err) {
              console.log("Short error:", err.message);
            }
          }

          console.log(`${channel}: Matched ${matchingShorts.length} Shorts`);

          if (
            keywordMatchedShorts.length > 0 &&
            oldShortsCount >=
              Math.max(3, Math.floor(keywordMatchedShorts.length * 0.7))
          ) {
            console.log(`${channel}: Reached date range limit`);

            stopPaging = true;
            break;
          }

          if (!continuationToken) {
            console.log(`${channel}: No more pages available`);
            break;
          }
        }

        if (pageCount >= MAX_PAGES) {
          console.log(`${channel}: Reached max page limit (${MAX_PAGES})`);
        }

        // Save/append this channel's newly matched shorts right away,
        // before moving on to the next channel.
        const creatorNamesForChannel = Object.keys(channelPostsByCreator);

        if (creatorNamesForChannel.length) {
          console.log(
            `${channel}: Saving ${creatorNamesForChannel.length} creator(s) to DB`,
          );

          for (const creatorName of creatorNamesForChannel) {
            try {
              await savePlatformData({
                creatorName,
                platform: "youtubeShorts",
                posts: channelPostsByCreator[creatorName],
              });
            } catch (err) {
              console.log(
                `${channel}: Failed saving posts for ${creatorName} -`,
                err.message,
              );
            }
          }
        } else {
          console.log(`${channel}: No new shorts to save`);
        }
      } catch (err) {
        console.log(err);
      }
    }

    const creatorResults = Object.values(creatorCache).map((creator) => ({
      ...creator,
      seenPosts: undefined,
    }));

    return {
      success: true,
      totalCreators: creatorResults.length,
      data: creatorResults,
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: error.message,
    };
  }
};

// ─── YOUTUBE & INSTAGRAM: SUBSCRIBER & FOLLOWER COUNTS ────────────────────────────────────────

export async function syncCreatorFollowers() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137.0.0.0 Safari/537.36",
  });

  try {
    for (const creator of CREATOR_NAMES) {
      try {
        let instagramFollowers = 0;
        let youtubeSubscribers = null;

        // ----------------------------------
        // Instagram Followers
        // ----------------------------------
        const instagramHandle = creator.instagram || null;

        if (instagramHandle) {
          try {
            const response = await rapidApiFetch(
              "https://instagram120.p.rapidapi.com/api/instagram/userInfo",
              {
                method: "POST",
                headers: {
                  "x-rapidapi-host": "instagram120.p.rapidapi.com",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  username: instagramHandle,
                }),
              },
            );

            const data = await response.json();

            instagramFollowers = data?.result?.[0]?.user?.follower_count || 0;
          } catch (err) {
            console.log(`${creator.name} instagram failed`, err.message);
          }
        }

        // ----------------------------------
        // Youtube Subscribers
        // ----------------------------------
        const youtubeHandle = creator.channelName || null;

        if (youtubeHandle) {
          try {
            await page.goto(`https://www.youtube.com/${youtubeHandle}`, {
              waitUntil: "networkidle",
              timeout: 60000,
            });

            await page.waitForTimeout(2000);

            youtubeSubscribers = await page
              .locator('span[aria-label*="subscribers"]')
              .first()
              .textContent();

            youtubeSubscribers =
              youtubeSubscribers?.trim()?.split(/\s+/)[0] || null;
          } catch (err) {
            console.log(`${creator.name} youtube failed`, err.message);
          }
        }

        // ----------------------------------
        // Update Existing Creator Config
        // ----------------------------------
        await SocialDumpStore.findOneAndUpdate(
          {
            creatorName: creator.name,
          },
          {
            $set: {
              instaFCount: instagramFollowers,
              youtubeFCount: youtubeSubscribers,
            },
          },
          {
            returnDocument: "after",
          },
        );

        console.log(`${creator.name} updated`, {
          instagramFollowers,
          youtubeSubscribers,
        });

        await sleep(1000);
      } catch (err) {
        console.log(`${creator.name} failed`, err.message);
      }
    }

    console.log("Creator follower sync completed");
  } catch (err) {
    console.log("Follower sync failed", err);
    throw err;
  } finally {
    await browser.close();
  }
}

export async function creatorTrendScoreCalc() {
  try {
    CREATOR_NAMES.map(async (f) => {
      let score = 0;
      let badge = null;

      const [articlesCount, socialPostsCount, prevScore] = await Promise.all([
        ArticleStore.countDocuments({
          creatorName: f.name,
        }),
        SocialAllDump.aggregate([
          {
            $match: {
              creatorName: f.name,
            },
          },
          {
            $group: {
              _id: null,
              instagram: { $sum: { $size: "$instagram" } },
              twitter: { $sum: { $size: "$twitter" } },
              youtube: { $sum: { $size: "$youtubeShorts" } },
            },
          },
        ]),
        Creator.findOne({ name: f.name }, { trendingScore: 1 }).lean(),
      ]);

      score = score + articlesCount * 10;
      score = score + (socialPostsCount[0]?.instagram || 0) * 6;
      score = score + (socialPostsCount[0]?.twitter || 0) * 8;
      score = score + (socialPostsCount[0]?.youtube || 0) * 4;

      // creators badge logic
      if (prevScore > 0 && score >= 0) {
        const delta = Math.abs(prevScore - score);
        badge = prevScore < score && delta >= 10 ? "Rising Creator" : null;
      }

      const instaUrl =
        f?.instagram?.length > 0
          ? `https://www.instagram.com/${f.instagram}/`
          : null;

      const youtubeUrl =
        f?.channelName?.length > 0
          ? `https://www.youtube.com/${f.channelName}`
          : null;

      await Creator.findOneAndUpdate(
        {
          name: f.name,
        },
        {
          name: f.name,
          channelName: f.channel,
          role: f.role,
          accentColor: f.accentColor,
          image: f.image,
          cardImage: f.cardImage,
          suggestionImage: f.suggestionImage,
          socialAccounts: {
            instagram: instaUrl,
            youtube: youtubeUrl,
          },
          trendingScore: score,
          badge: badge,
        },
        {
          upsert: true,
          returnDocument: "after",
        },
      );
    });

    const top3Creators = await Creator.find(
      {},
      { name: 1, trendingScore: 1, badge: 1 },
    )
      .sort({ trendingScore: -1 })
      .limit(3)
      .lean();

    await Creator.bulkWrite(
      top3Creators.map((creator) => ({
        updateOne: {
          filter: { _id: creator._id },
          update: { $set: { badge: "Top Creator" } },
        },
      })),
    );
  } catch (err) {
    console.log("Creators ScoreCalc failed", err);
    throw err;
  }
}
