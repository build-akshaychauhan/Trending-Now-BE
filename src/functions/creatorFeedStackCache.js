import cache from "../cache/caching.js";
import Creator from "../models/Creator.js";
import { authHomeFeed } from "../utils/authHomeFeed.js";
import { BuzzingData } from "../utils/creatorHomeScreen.js";
import { creatorPageFeed } from "./creatorPageFeed.js";

export async function creatorFeedStackCache(
  key1,
  key2,
  key3,
  isCacheWarming = false,
) {
  try {
    const topInfluencers = await Creator.find()
      .sort({ trendingScore: -1 })
      .lean();

    await Promise.all(
      topInfluencers.map(async (creator) => {
        const [creatorFeed, buzzingFeed, creatorPage] = await Promise.all([
          authHomeFeed(creator), // homepage each creator feed-stack data
          BuzzingData(creator), // buzzing cards data for each creator
          creatorPageFeed(key2 + creator.name, creator.name, true), // creators page full data each creator
        ]);

        cache.set(key1 + creator.name, creatorFeed);
        cache.set(key2 + creator.name, creatorPage);
        cache.set(key3 + creator.name, buzzingFeed);
      }),
    );

    return {
      success: true,
      data: "creators-data-cached",
    };
  } catch (error) {
    console.error("data caching error:", error);

    return {
      success: false,
      error: "Server Error",
    };
  }
}
