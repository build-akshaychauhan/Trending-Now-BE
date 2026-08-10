import mongoose from "mongoose";

const AppLayoutSchema = new mongoose.Schema(
  {
    appScreen: {
      type: String,
    },
    userType: {
      type: String,
      required: true,
      enum: ["Guest", "User"],
    },
    layoutData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default mongoose.model("AppLayout", AppLayoutSchema);
