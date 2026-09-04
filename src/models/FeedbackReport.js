import mongoose from "mongoose";

const FeedbackReportSchema = new mongoose.Schema(
  {
    appMeta: {
      version: {
        type: String,
      },
      platform: {
        type: String,
      },
    },
    feedbackMessage: {
      type: String,
    },
    feedbackImage: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default mongoose.model("FeedbackReport", FeedbackReportSchema);
