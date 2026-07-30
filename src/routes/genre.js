import express from "express";
import {
  addGenre,
  allGenre,
  updateGenre,
  deleteGenre,
  addCreatorsToGenre,
  removeCreatorFromGenre,
} from "../functions/genrePageData.js";

const router = express.Router();

// Create Genre
router.post("/", async (req, res) => {
  const response = await addGenre(req.body);

  if (!response.success) {
    return res.status(400).json(response);
  }

  return res.status(201).json(response);
});

// Get All Genres
router.get("/", async (req, res) => {
  const response = await allGenre();

  if (!response.success) {
    return res.status(500).json(response);
  }

  return res.status(200).json(response);
});

// Update Genre
router.put("/:id", async (req, res) => {
  const response = await updateGenre(req.params.id, req.body);

  if (!response.success) {
    return res.status(400).json(response);
  }

  return res.status(200).json(response);
});

// Delete Genre
router.delete("/:id", async (req, res) => {
  const response = await deleteGenre(req.params.id);

  if (!response.success) {
    return res.status(404).json(response);
  }

  return res.status(200).json(response);
});

// Add creators to a genre
router.patch("/:id/creators", async (req, res) => {
  const { creatorIds } = req.body;

  const response = await addCreatorsToGenre(req.params.id, creatorIds);

  if (!response.success) {
    return res.status(400).json(response);
  }

  return res.status(200).json(response);
});

// Remove creator from a genre
router.delete("/:id/creators/:creatorId", async (req, res) => {
  const response = await removeCreatorFromGenre(
    req.params.id,
    req.params.creatorId,
  );

  if (!response.success) {
    return res.status(400).json(response);
  }

  return res.status(200).json(response);
});

export default router;
