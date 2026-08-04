import ArticleStore from "../models/ArticleStore.js";
import SocialAllDump from "../models/SocialAllDump.js";
import SocialDumpStore from "../models/SocialDumpStore.js";
import {
  collectPosts,
  CreatorPostMaker,
  StackPostMaker,
} from "./feedHelper.js";
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

export async function BuzzingData(creator) {
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

  const PostMaker = await CreatorPostMaker(creator.name, sortedTopics);

  const BuzzingCards = getUniqueCreatorsWithHighestTopic(PostMaker).map(
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
      posts:
        sortedTopics
          .map((s) => s.label == item.topicLabel && s.posts)
          .filter(Boolean)[0] || [],
    }),
  );

  return BuzzingCards;
}
