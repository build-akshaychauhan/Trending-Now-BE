import express from "express";
import { creatorsRankData } from "../functions/creatorsRankData.js";

const router = express.Router();

// Get Creators Rank
router.get("/", async (req, res) => {
  const response = await creatorsRankData();

  if (!response.success) {
    return res.status(500).json(response);
  }

  return res.status(200).json(response);
});

export default router;
