import express from "express";
import jwt from "jsonwebtoken";
import cache from "../cache/caching.js";
import Article from "../models/ArticleStore.js";
import Creator from "../models/Creator.js";
import User from "../models/User.js";
import { normaliseCreator } from "../utils/normalizer.js";
import SocialDumpStore from "../models/SocialDumpStore.js";
import SocialAllDump from "../models/SocialAllDump.js";
import ArticleStore from "../models/ArticleStore.js";
import { collectPosts, StackPostMaker } from "../utils/feedHelper.js";
import { CACHING_KEYS } from "../cache/cacheKeys.js";
import { homePageFeed, unAuthHomePageFeed } from "../functions/homePageFeed.js";
import { optionalAuthMiddleware } from "../middleware/authVerify.js";

const router = express.Router();

// FEED API
router.get("/homepage", optionalAuthMiddleware, async (req, res) => {
  const firebase_uid = req.auth_firebase_uid || "";
  const key = CACHING_KEYS.HomepageFeedKey;

  let response = await unAuthHomePageFeed(key);

  if (firebase_uid) {
    response = await homePageFeed(key, firebase_uid);
  }

  if (!response.success) {
    return res.status(500).json(response);
  }

  return res.status(200).json(response);
});

export default router;
