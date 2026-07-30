import Creator from "../models/Creator.js";

export async function creatorsRankData() {
  try {
    const topInfluencers = await Creator.find().sort({
      trendingScore: -1,
    });

    return {
      success: true,
      data: topInfluencers,
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: "Server Error",
    };
  }
}
