import mongoose from "mongoose";

const PlatformStateSchema = new mongoose.Schema(
  {
    bootstrapCompleted: {
      type: Boolean,
      default: false,
    },

    lastScrapedAt: {
      type: Date,
      default: null,
    },

    latestPostDate: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const SocialDumpSchema = new mongoose.Schema(
  {
    creatorName: {
      type: String,
      unique: true,
      trim: true,
    },

    instaFCount: {
      type: Number,
      default: 0,
    },

    youtubeFCount: {
      type: String,
      default: null,
    },

    platformState: {
      instagram: {
        type: PlatformStateSchema,
        default: () => ({}),
      },

      twitter: {
        type: PlatformStateSchema,
        default: () => ({}),
      },

      youtubeShorts: {
        type: PlatformStateSchema,
        default: () => ({}),
      },
    },

    // ---- Adaptive per-creator scrape frequency ----
    // Tracks how many times/day this creator gets scraped (2 by default,
    // bumped to 3 when a scrape run finds >= threshold new posts in a day,
    // reverted back to 2 after 2 consecutive days below threshold).
    scrapeFrequency: {
      timesPerDay: {
        type: Number,
        default: 2,
      },

      // Running count of NEW posts found for this creator on `trackingDate`
      dailyNewPostsCount: {
        type: Number,
        default: 0,
      },

      // YYYY-MM-DD (UTC) that dailyNewPostsCount belongs to
      trackingDate: {
        type: String,
        default: null,
      },

      // Consecutive full days (while boosted) that stayed below threshold
      belowThresholdDays: {
        type: Number,
        default: 0,
      },

      lastBoostedAt: {
        type: Date,
        default: null,
      },

      lastUpdatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default mongoose.model("SocialDumpStore", SocialDumpSchema);
