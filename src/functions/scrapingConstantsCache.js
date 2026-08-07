import cache from "../cache/caching.js";
import { loadScrapingConstants } from "../constants/keywords.js";
import Constants from "../models/Constants.js";

export async function scrapingConstantsCache(key4) {
  try {
    const constants = await Constants.findOne().lean();
    cache.set(key4, constants);

    // Initial load
    loadScrapingConstants();
  } catch (error) {
    console.error("constants caching error:", error);

    return {
      success: false,
      error: "Server Error",
    };
  }
}
