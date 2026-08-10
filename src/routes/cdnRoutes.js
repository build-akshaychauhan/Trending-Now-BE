import express from "express";

import {
  getCdnImages,
  uploadCdnImage,
  deleteCdnImage,
} from "../controllers/cdnControls.js";

import { uploadImage } from "../middleware/cdnUpload.js";

const router = express.Router();

// Get all CDN images
router.get("/images", getCdnImages);

// Upload image
router.post("/upload", uploadImage.single("image"), uploadCdnImage);

// Delete image
router.delete("/images/:id", deleteCdnImage);

export default router;
