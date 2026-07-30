import mongoose from "mongoose";

const GenreSchema = new mongoose.Schema(
  {
    genreName: {
      type: String,
      unique: true,
    },
    genreColor: {
      type: String,
    },
    genreImage: {
      type: String,
    },
    creatorsList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Creator",
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default mongoose.model("Genre", GenreSchema);
