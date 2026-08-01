import cache from "../cache/caching.js";
import Creator from "../models/Creator.js";
import User from "../models/User.js";
import { authHomeFeed } from "../utils/authHomeFeed.js";

export async function unAuthHomePageFeed(key) {
  try {
    const topInfluencers = await Creator.find().sort({
      trendingScore: -1,
    });

    let posts = [];

    //Un-Authenticated feed data
    for (const Creator of topInfluencers.slice(0, 3)) {
      const cacheKey = key + Creator.name;
      let cacheData = cache.get(cacheKey);
      if (!cacheData) continue;
      posts.push({
        ...cacheData,
        PostStack: cacheData.PostStack.slice(0, 2),
      });
    }

    return {
      success: true,
      data: posts,
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: "Server Error",
    };
  }
}

export async function homePageFeed(key, firebase_uid) {
  try {
    let user = await User.findOne({
      firebaseUid: firebase_uid,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let posts = {};
    let favCreator = [];
    let relatedCreator = [];
    let relatedGenre = [];
    let trendingCreator = [];

    const favoriteCreators = user.favoriteCreators;

    const favoriteCreatorDocs = await Creator.find(
      { _id: { $in: favoriteCreators } },
      { name: 1, genres: 1 },
    )
      .sort({
        trendingScore: -1,
      })
      .lean();

    const genres = [
      ...new Set(favoriteCreatorDocs.flatMap((c) => c.genres || [])),
    ];

    if (genres.length > 0) {
      relatedCreator = await Creator.find(
        { _id: { $nin: favoriteCreators }, genres: { $in: genres } },
        { name: 1, trendingScore: 1 },
      )
        .sort({
          trendingScore: -1,
        })
        .lean();
    }

    const excludedIds = [
      ...new Set([
        ...favoriteCreators.map((id) => id.toString()),
        ...relatedCreator.map((c) => c._id.toString()),
      ]),
    ];

    const trendingInfluencers = await Creator.find(
      { _id: { $nin: excludedIds } },
      { name: 1, trendingScore: 1 },
    )
      .sort({
        trendingScore: -1,
      })
      .lean();

    for (const Creator of favoriteCreatorDocs) {
      const cacheKey = key + Creator.name;
      let cacheData = cache.get(cacheKey);
      if (!cacheData) continue;
      favCreator.push(cacheData);
    }

    for (const Creator of relatedCreator) {
      const cacheKey = key + Creator.name;
      let cacheData = cache.get(cacheKey);
      if (!cacheData) continue;
      relatedGenre.push(cacheData);
    }

    for (const Creator of trendingInfluencers) {
      const cacheKey = key + Creator.name;
      let cacheData = cache.get(cacheKey);
      if (!cacheData) continue;
      trendingCreator.push(cacheData);
    }

    return {
      success: true,
      data: {
        favouriteCreator: favCreator,
        relatedGenreCreator: relatedGenre,
        trendingCreator: trendingCreator,
      },
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: "Server Error",
    };
  }
}
