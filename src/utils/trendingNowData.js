import SocialAllDump from "../models/SocialAllDump.js";
import SocialDumpStore from "../models/SocialDumpStore.js";
import { normaliseCreator, normaliseFavoriteCreator } from "./normalizer.js";

export async function trendingNowData(creator) {
  const creatorName = creator.name;
  const creatorConfig = await SocialDumpStore.findOne({
    creatorName: creatorName,
  }).lean();

  const rawDoc = await SocialAllDump.find({
    creatorName: creatorName,
  })
    .sort({
      scrapeDate: -1,
    })
    .lean();

  if (rawDoc.length === 0) {
    return {
      success: false,
      error: `Creator "${creatorName}" not found`,
    };
  }

  const data = normaliseFavoriteCreator(creatorConfig, rawDoc);

  return data;
}
