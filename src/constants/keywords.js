import { CACHING_KEYS } from "../cache/cacheKeys.js";
import cache from "../cache/caching.js";

export const BREAKING_KEYWORDS = [];
export const NEWS_KEYWORDS = [];
export const CREATOR_NAMES = [];
export const YT_CHANNELS = [];
export const INSTA_ACCOUNTS = [];
export const HANDLES = {};
export const BLOCKED_WORDS = [];

function replaceArray(target, source = []) {
  target.length = 0;
  target.push(...source);
}

function replaceObject(target, source = {}) {
  // Remove old keys
  Object.keys(target).forEach((key) => delete target[key]);

  // Add new keys
  Object.assign(target, source);
}

export function loadScrapingConstants() {
  const scrapingConstants = cache.get(CACHING_KEYS.ScrapingConstantsKey) || {};

  replaceArray(BREAKING_KEYWORDS, scrapingConstants.BREAKING_KEYWORDS);
  replaceArray(NEWS_KEYWORDS, scrapingConstants.NEWS_KEYWORDS);
  replaceArray(CREATOR_NAMES, scrapingConstants.CREATOR_NAMES);
  replaceArray(YT_CHANNELS, scrapingConstants.YT_CHANNELS);
  replaceArray(INSTA_ACCOUNTS, scrapingConstants.INSTA_ACCOUNTS);
  replaceArray(BLOCKED_WORDS, scrapingConstants.BLOCKED_WORDS);

  replaceObject(HANDLES, scrapingConstants.HANDLES);
}

loadScrapingConstants();

export const HAPPENING_KEYWORDS = [
  "happening",
  "trending",
  "in news",
  "viral",
  "making headlines",
  "sparks debate",
  "gains attention",
  "reacting",
  "responds",
  "shares",
  "posted",
  "announced",
  "criticized",
  "praised",
  "slammed",
  "accused",
  "involved",
  "discussed",
  "surfaced",
  "revealed",
  "claims",
  "says",
  "reports",
  "launches",
  "collaborates",
  "appears",
  "supports",
  "opposes",
  "comments",
  "opens up",
  "addresses",
  "confirms",
  "denies",
  "apologizes",
  "celebrates",
  "attends",
  "streams",
  "uploads",
  "trends",
  "featured",
];
