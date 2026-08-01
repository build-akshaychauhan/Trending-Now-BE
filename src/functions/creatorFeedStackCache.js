import cache from "../cache/caching.js";
import Creator from "../models/Creator.js";
import { authHomeFeed } from "../utils/authHomeFeed.js";

export async function creatorFeedStackCache(key) {
  try {
    const topInfluencers = await Creator.find().sort({
      trendingScore: -1,
    });

    for (const creator of topInfluencers) {
      const creatorFeed = await authHomeFeed(creator); //Creator Poststack
      const cacheKey = key + creator.name;
      cache.set(cacheKey, creatorFeed);
    }

    return {
      success: true,
      data: "creators-data-cached",
    };f
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: "Server Error",
    };
  }
}
