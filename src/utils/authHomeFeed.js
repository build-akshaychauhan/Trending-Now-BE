import ArticleStore from "../models/ArticleStore.js";
import Creator from "../models/Creator.js";
import SocialAllDump from "../models/SocialAllDump.js";
import SocialDumpStore from "../models/SocialDumpStore.js";
import { collectPosts, StackPostMaker } from "./feedHelper.js";
import { normaliseCreator } from "./normalizer.js";

function getUniqueCreatorsWithHighestTopic(data) {
  const creators = new Map();
  if (!data) return [];

  for (const item of data) {
    const creator = item.creatorSlug;
    const count = item.topTopics?.[0]?.count || 0;

    if (
      !creators.has(creator) ||
      count > (creators.get(creator).topTopics?.[0]?.count || 0)
    ) {
      creators.set(creator, item);
    }
  }

  return [...creators.values()];
}

export async function authHomeFeed(creator) {
  const topics = {};

  const creatorConfig = await SocialDumpStore.findOne({
    creatorName: creator.name,
  }).lean();

  const rawDoc = await SocialAllDump.find({
    creatorName: creator.name,
  })
    .sort({
      scrapeDate: -1,
    })
    .lean();

  const newsDoc = await ArticleStore.find({
    creatorName: creator.name,
  }).lean();

  if (rawDoc.length === 0 && newsDoc.length === 0) {
    return {
      success: false,
      error: `Creator "${creator.name}" not found`,
    };
  }

  const data = normaliseCreator(creatorConfig, rawDoc, newsDoc);

  const allposts = collectPosts(data);

  allposts.forEach((post) => {
    const topic = post?.topicMeta;

    if (!topic?.slug) return;

    topics[topic.slug] ??= {
      slug: topic.slug,
      label: topic.label,
      posts: [],
    };

    topics[topic.slug].posts.push(post);
  });

  const sortedTopics = Object.values(topics).sort(
    (a, b) => b.posts.length - a.posts.length,
  );

  const PostStack = await StackPostMaker(creator.name, sortedTopics);

  const BuzzingCards = getUniqueCreatorsWithHighestTopic(PostStack).map(
    (item) => ({
      id: `${item.creatorSlug}-${item.topicSlug}`,
      creator: item?.creatorSlug?.replaceAll("_", " "),
      topic: item.topicLabel,
      count: item.topicCount,
      headline: item.headline,
      image:
        item.igPost?.media?.[0]?.url ||
        item.newsItems?.[0]?.urlToImage ||
        item.twPost?.media?.[0]?.thumbnail ||
        item.twPost?.media?.[0]?.url ||
        item.shortPost?.thumbnailUrl,
      type: item.stackCategory,
    }),
  );

  const headline =
    sortedTopics[0]?.posts[0]?.normalizedText.length > 80
      ? sortedTopics[0]?.posts[0]?.normalizedText.slice(0, 80) + "..."
      : sortedTopics[0]?.posts[0]?.normalizedText;

  const topHeadline = sortedTopics[0]?.posts?.[0] && {
    _id: sortedTopics[0]?.posts[0]?._id || sortedTopics[0]?.posts[0]?.id,
    headline: headline,
  };

  const topicSlug = sortedTopics.map((s) => s.slug);

  return {
    creatorSlug: {
      name: creator.name,
      trendingScore: creator.trendingScore.toFixed(2),
      image: creator.image,
      accentColor: creator.accentColor,
    },
    topHeadline: topHeadline,
    topicSlug: topicSlug,
    PostStack: PostStack,
    BuzzingCards: BuzzingCards,
  };
}
