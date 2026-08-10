import mongoose from "mongoose";

const CreatorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
    },

    channelName: {
      type: String,
    },

    role: {
      type: String,
    },

    trendingScore: {
      type: Number,
      default: 0,
    },

    accentColor: { type: String },
    image: { type: String },
    cardImage: { type: String },
    suggestionImage: { type: String },

    badge: {
      type: String,
      default: "null",
      enum: ["Top Creator", "Rising Creator"],
    },

    genres: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Genre",
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default mongoose.model("Creator", CreatorSchema);
