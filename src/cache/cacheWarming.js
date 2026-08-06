import { creatorFeedStackCache } from "../functions/creatorFeedStackCache.js";
import { creatorPageFeed } from "../functions/creatorPageFeed.js";
import Creator from "../models/Creator.js";
import { CACHING_KEYS } from "./cacheKeys.js";
import cache from "./caching.js";

export async function cacheWarming() {
  console.info("cache warming started...");

  try {
    // Home Page Feed warming up
    const key1 = CACHING_KEYS.HomepageFeedKey;
    const key2 = CACHING_KEYS.CreatorPageFeedKey;
    const key3 = CACHING_KEYS.BuzzingFeedKey;

    await creatorFeedStackCache(key1, key2, key3, true);

    printCache();
    console.info("cache warming completed.");
  } catch (error) {
    console.error("cache warming failed !!", error);
  }
}

export const printCache = () => {
  console.log("\n===== CACHE DATA =====");

  const keys = cache.keys();

  for (const key of keys) {
    console.log(`\nKey: ${key}`);
    // console.dir(cache.get(key), { depth: null, colors: true });
  }

  console.log("\n======================\n");
};
