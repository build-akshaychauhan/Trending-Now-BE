import express from "express";
import { allGenre } from "../functions/genrePageData.js";

const router = express.Router();

// Get All Genres
router.get("/", async (req, res) => {
  const response = await allGenre();

  if (!response.success) {
    return res.status(500).json(response);
  }

  return res.status(200).json(response);
});

export default router;
