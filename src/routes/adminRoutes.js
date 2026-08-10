import express from "express";
import {
  addCreatorsGenre,
  allGenres,
  createConstant,
  createGenre,
  creatorList,
  deleteConstant,
  deleteGenres,
  getAppCard,
  getAppLayout,
  getConstant,
  removeCreatorsGenre,
  updateConstant,
  updateGenres,
  upsertAppCard,
  upsertAppLayout,
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

// App screen layout API's
router.post("/screen", upsertAppLayout);
router.get("/screen/:appScreen", getAppLayout);

// App screen layout API's
router.post("/card", upsertAppCard);
router.get("/card/:appCard", getAppCard);

export default router;
