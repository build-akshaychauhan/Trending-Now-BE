import mongoose from "mongoose";

const ConstantSchema = new mongoose.Schema(
  {
    CREATOR_NAMES: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    YT_CHANNELS: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    INSTA_ACCOUNTS: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    HANDLES: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    NEWS_KEYWORDS: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    BREAKING_KEYWORDS: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    BLOCKED_WORDS: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default mongoose.model("Constant", ConstantSchema);
