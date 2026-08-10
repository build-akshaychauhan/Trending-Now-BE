import mongoose from "mongoose";

const AppCardSchema = new mongoose.Schema(
  {
    appCard: {
      type: String,
    },
    userType: {
      type: String,
      required: true,
      enum: ["Guest", "User"],
    },
    cardData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default mongoose.model("AppCard", AppCardSchema);
