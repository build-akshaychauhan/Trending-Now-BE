import mongoose from "mongoose";

const ImageCDNSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    originalName: {
      type: String,
      required: true,
    },

    url: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      default: "image/webp",
    },

    size: {
      type: Number,
      required: true,
    },

    originalSize: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("ImageCDN", ImageCDNSchema);
