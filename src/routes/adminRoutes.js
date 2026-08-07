import express from "express";
import {
  addCreatorsGenre,
  allGenres,
  createConstant,
  createGenre,
  creatorList,
  deleteConstant,
  deleteGenres,
  getConstant,
  removeCreatorsGenre,
  updateConstant,
  updateGenres,
} from "../controllers/adminControls.js";
import Creator from "../models/Creator.js";

const router = express.Router();

// Creator CRUD
router.post("/constants", createConstant);
router.get("/constants", getConstant);
router.patch("/constants", updateConstant);
router.delete("/constants", deleteConstant);

// Genre CRUD
router.post("/genre", createGenre);
router.get("/genre", allGenres);
router.put("/genre/:id", updateGenres);
router.delete("/genre/:id", deleteGenres);
router.patch("/genre/:id/creators", addCreatorsGenre);
router.delete("/genre/:id/creators/:creatorId", removeCreatorsGenre);
router.get("/all-creators", creatorList);

export default router;
