import express from "express";
import { optionalAuthMiddleware } from "../middleware/authVerify.js";
import { creatorFeedHomescreen } from "../functions/creatorpagehomescreen.js";

const router = express.Router();

router.get("/", optionalAuthMiddleware, creatorFeedHomescreen);

export default router;
