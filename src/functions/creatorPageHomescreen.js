import cache from "../cache/caching.js";
import { CACHING_KEYS } from "../cache/cacheKeys.js";
import Creator from "../models/Creator.js";
import User from "../models/User.js";
import AppLayout from "../models/AppLayout.js";

import { byLatest, getScore } from "../utils/normalizer.js";
import { trendingNowData } from "../utils/trendingNowData.js";
import AppCard from "../models/AppCard.js";
import Genre from "../models/Genre.js";
import SocialDumpStore from "../models/SocialDumpStore.js";

const DEFAULT_LAYOUT = [
  {
    type: "favoriteCreators",
    position: 1,
    is_visible: true,
  },
  {
    type: "trendingNow",
    position: 2,
    is_visible: true,
  },
  {
    type: "creatorSuggestions",
    position: 3,
    is_visible: true,
  },
  {
    type: "buzzingCards",
    position: 4,
    is_visible: true,
  },
];

export const creatorFeedHomescreen = async (req, res) => {
  const firebase_uid = req.auth_firebase_uid || "";

  let favInfluencersList = [];
  let buzzingPosts = [];
  let topPosts = [];
  let creatorSuggestions = [];

  const key3 = CACHING_KEYS.BuzzingFeedKey;

  try {
    /*
     * --------------------------------------------------
     * 1. Determine user type
     * --------------------------------------------------
     */

    let userType = "Guest";
    let user = null;

    if (firebase_uid) {
      user = await User.findOne({
        firebaseUid: firebase_uid,
      }).lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      userType = "User";

      const favoriteCreators = user.favoriteCreators || [];

      favInfluencersList = await Creator.find({
        _id: { $in: favoriteCreators },
      })
        .sort({
          trendingScore: -1,
        })
        .lean();

      const creatorNames = favInfluencersList.map((c) => c.name);

      const socialDumpStores = await SocialDumpStore.find(
        { creatorName: { $in: creatorNames } },
        { creatorName: 1, "scrapeFrequency.dailyNewPostsCount": 1 },
      ).lean();

      const postsCountMap = new Map(
        socialDumpStores.map((item) => [
          item.creatorName,
          item.scrapeFrequency?.dailyNewPostsCount || 0,
        ]),
      );

      console.log(new Date().toISOString(), postsCountMap);

      favInfluencersList = favInfluencersList.map((c) => ({
        ...c,
        newFetchCount: postsCountMap.get(c.name) || 0,
      }));
    }

    /*
     * --------------------------------------------------
     * 2. Get layout for Guest/User
     * --------------------------------------------------
     */

    const appLayout = await AppLayout.findOne({
      appScreen: "Creator-Homescreen",
      userType,
    }).lean();

    /*
     * --------------------------------------------------
     * 3. Get all creators
     * --------------------------------------------------
     */

    const influencersList = await Creator.find({})
      .sort({
        trendingScore: -1,
      })
      .lean();

    /*
     * --------------------------------------------------
     * 4. Get buzzing posts
     * --------------------------------------------------
     */

    for (const creator of influencersList) {
      const buzzingCacheKey = key3 + creator.name;

      const creatorFeed = cache.get(buzzingCacheKey);

      if (!creatorFeed) continue;

      buzzingPosts.push(...creatorFeed);
    }

    /*
     * --------------------------------------------------
     * 5. Creator suggestions
     * --------------------------------------------------
     */

    const favoriteGenreIds = [
      ...new Set(
        favInfluencersList.flatMap((creator) =>
          creator?.genres?.map((genre) => genre?._id),
        ),
      ),
    ];

    const genreCreators = await Genre.find({
      _id: { $in: favoriteGenreIds },
    })
      .populate("creatorsList")
      .lean();

    // Flatten creators from all genres
    const creatorlist = genreCreators.flatMap((genre) => genre?.creatorsList);

    // Create Set of favorite creator IDs
    const favoriteCreatorIds = new Set(
      favInfluencersList.map((creator) => creator._id?.toString()),
    );

    // Remove already-favorited creators
    const unfavoritedgenreCreators = creatorlist.filter(
      (creator) => !favoriteCreatorIds.has(creator._id?.toString()),
    );

    const suggestedInfluencers =
      unfavoritedgenreCreators.length > 0
        ? unfavoritedgenreCreators
        : influencersList;

    for (const creator of suggestedInfluencers) {
      if (creator.badge && creator.badge !== null) {
        const genreCreatorName =
          favInfluencersList.length > 0
            ? favInfluencersList
                .filter((c) =>
                  c.genres?.some((g) =>
                    creator.genres?.some(
                      (cg) => g._id.toString() === cg._id.toString(),
                    ),
                  ),
                )
                .slice(0, 1)
                .map((c) => c.name)
                .join(", ")
            : influencersList
                .filter(
                  (c) =>
                    c._id?.toString() !== creator._id?.toString() &&
                    c.name !== creator.name &&
                    c.genres?.some((g) =>
                      creator.genres?.some(
                        (cg) => g._id.toString() === cg._id.toString(),
                      ),
                    ),
                )
                .slice(0, 1)
                .map((c) => c.name)[0];

        const creatorMeta = {
          CreatorName: creator.name,
          badge: creator.badge,
          role: creator.role,
          suggestionline: `Loved by +2.5K fans of ${genreCreatorName}`,
          suggestionImage: creator.suggestionImage,
        };
        if (
          !creatorSuggestions.some(
            (item) => item.CreatorName === creatorMeta.CreatorName,
          )
        ) {
          creatorSuggestions.push(creatorMeta);
        }
      }
    }

    /*
     * --------------------------------------------------
     * 6. Trending posts
     * --------------------------------------------------
     */

    const influencers =
      favInfluencersList.length > 0 ? favInfluencersList : influencersList;

    for (const creator of influencers) {
      const trendingPosts = await trendingNowData(creator);

      if (trendingPosts?.length) {
        topPosts.push(...trendingPosts);
      }
    }

    topPosts = topPosts
      .sort(byLatest)
      .sort((a, b) => getScore(b) - getScore(a))
      .slice(0, 20);

    if (favInfluencersList.length == 0) {
      const AppCardData = await AppCard.findOne({
        appCard: "Personalized-FeedCard",
        userType,
      }).lean();

      const personalizeFeedData =
        AppCardData?.cardData?.cards.length > 0
          ? AppCardData?.cardData?.cards
          : [];

      favInfluencersList.push(...personalizeFeedData);
    }

    /*
     * --------------------------------------------------
     * 7. All sections actually available from API
     * --------------------------------------------------
     */

    const availableSections = {
      favoriteCreators: favInfluencersList,
      trendingNow: topPosts,
      creatorSuggestions,
      buzzingCards: buzzingPosts,
    };

    /*
     * --------------------------------------------------
     * 8. Get layout
     * --------------------------------------------------
     */

    const dbSections =
      appLayout?.layoutData?.sections?.length > 0
        ? appLayout.layoutData.sections
        : DEFAULT_LAYOUT;

    /*
     * --------------------------------------------------
     * 9. Map DB layout with available API sections
     * Missing sections:
     *   -> append at the end
     * --------------------------------------------------
     */

    const dbSectionTypes = new Set(dbSections.map((section) => section.type));

    const configuredSections = dbSections
      .filter((section) => availableSections[section.type])
      .sort((a, b) => a.position - b.position);

    /*
     * Find API sections which are not present in DB layout
     */

    const missingSections = Object.keys(availableSections)
      .filter((type) => !dbSectionTypes.has(type))
      .map((type, index) => ({
        type,
        position: dbSections.length + index + 1,
        is_visible: true,
      }));

    /*
     * Combine configured + missing sections
     */

    const finalLayout = [...configuredSections, ...missingSections];

    /*
     * --------------------------------------------------
     * 10. Build final response according to layout
     * --------------------------------------------------
     */

    const dataLayout = finalLayout
      .filter((section) => section.is_visible !== false)
      .map((section) => ({
        type: section.type,
        data: availableSections[section.type],
      }));

    /*
     * --------------------------------------------------
     * 11. Response
     * --------------------------------------------------
     */

    return res.status(200).json({
      success: true,
      userType,
      data: dataLayout,
    });
  } catch (error) {
    console.error("Creator Home Screen Error:", error);

    return res.status(500).json({
      success: false,
      error: "Server Error",
    });
  }
};
