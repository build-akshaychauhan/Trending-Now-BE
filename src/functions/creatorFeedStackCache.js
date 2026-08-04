import cache from "../cache/caching.js";
import Creator from "../models/Creator.js";
import { authHomeFeed } from "../utils/authHomeFeed.js";
import { BuzzingData } from "../utils/creatorHomeScreen.js";

export async function creatorFeedStackCache(
  key1,
  key3,
  isCacheWarming = false,
) {
  try {
    const topInfluencers = await Creator.find().sort({
      trendingScore: -1,
    });

    for (const creator of topInfluencers) {
      const creatorFeed = await authHomeFeed(creator); //Creator Poststack
      const cacheKey = key1 + creator.name;
      cache.set(cacheKey, creatorFeed);

      const buzzingFeed = await BuzzingData(creator); //Buzzing Posts Cache
      const buzzingCacheKey = key3 + creator.name;
      cache.set(buzzingCacheKey, buzzingFeed);
    }

    return {
      success: true,
      data: "creators-data-cached",
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: "Server Error",
    };
  }
}
