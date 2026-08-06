import cache from "../cache/caching.js";
import { CACHING_KEYS } from "../cache/cacheKeys.js";
import Creator from "../models/Creator.js";
import User from "../models/User.js";
import { BuzzingData } from "../utils/creatorHomeScreen.js";
import { byLatest, getScore } from "../utils/normalizer.js";
import { trendingNowData } from "../utils/trendingNowData.js";

export const creatorFeedHomescreen = async (req, res) => {
  const firebase_uid = req.auth_firebase_uid || "";
  let favInfluencersList = [];
  let buzzingPosts = [];
  let topPosts = [];
  let creatorSuggestions = [];

  const key3 = CACHING_KEYS.BuzzingFeedKey;

  try {
    if (firebase_uid) {
      let user = await User.findOne({
        firebaseUid: firebase_uid,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const favoriteCreators = user.favoriteCreators;

      favInfluencersList = await Creator.find({
        _id: { $in: favoriteCreators },
      })
        .sort({
          trendingScore: -1,
        })
        .lean();
    }

    let influencersList = await Creator.find().sort({
      trendingScore: -1,
    });

    for (const creator of influencersList) {
      const buzzingCacheKey = key3 + creator.name;
      const creatorFeed = cache.get(buzzingCacheKey);
      if (!creatorFeed) continue;
      buzzingPosts.push(...creatorFeed);
    }

    const unfavoritedCreators = influencersList.filter(
      (creator) =>
        !favInfluencersList.some((fav) => fav._id.equals(creator._id)),
    );

    for (const creator of unfavoritedCreators) {
      creatorSuggestions.push(creator.suggestionImage);
    }

    const influencers =
      favInfluencersList.length > 0 ? favInfluencersList : influencersList;
    for (const creator of influencers) {
      const trendingPosts = await trendingNowData(creator);

      topPosts.push(...trendingPosts);
    }

    topPosts = topPosts
      .sort(byLatest)
      .sort((a, b) => getScore(b) - getScore(a))
      .slice(0, 20);

    return res.status(200).json({
      success: true,
      data: {
        FavoriteCreators: favInfluencersList,
        trendingNow: topPosts,
        creatorSuggestions: creatorSuggestions,
        BuzzingCards: buzzingPosts,
      },
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      error: "Server Error",
    });
  }
};
