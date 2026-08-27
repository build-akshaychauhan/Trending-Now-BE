import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

import ImageCDN from "../models/ImageCDN.js";

const uploadDir = path.join(process.cwd(), "public", "cdn", "images");

// --------------------------------------------------
// Upload Image
// POST /admin/cdn/upload
// --------------------------------------------------

export const uploadCdnImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    // Make sure directory exists
    await fs.mkdir(uploadDir, {
      recursive: true,
    });

    // Generate unique filename
    const filename = `${Date.now()}-${crypto
      .randomBytes(6)
      .toString("hex")}.webp`;

    const outputPath = path.join(uploadDir, filename);

    // Compress + resize + convert to WebP
    await sharp(req.file.buffer)
      .rotate() // respect EXIF orientation
      .resize({
        width: 2000,
        withoutEnlargement: true,
      })
      .webp({
        quality: 80,
        effort: 6,
      })
      .toFile(outputPath);

    // Get compressed file size
    const stats = await fs.stat(outputPath);

    const baseUrl =
      `${req.protocol}://${req.get("host")}` || process.env.PUBLIC_URL;

    const imageUrl = `${baseUrl}/cdn/images/${filename}`;

    // Save metadata
    const image = await ImageCDN.create({
      filename,
      originalName: req.file.originalname,
      url: imageUrl,
      mimeType: "image/webp",
      size: stats.size,
      originalSize: req.file.size,
    });

    return res.status(201).json({
      success: true,
      message: "Image uploaded successfully",
      data: image,
    });
  } catch (error) {
    console.error("CDN upload error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload image",
    });
  }
};

// --------------------------------------------------
// List Images
// GET /admin/cdn/images
// --------------------------------------------------

export const getCdnImages = async (req, res) => {
  try {
    const images = await ImageCDN.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      data: images,
    });
  } catch (error) {
    console.error("CDN list error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch CDN images",
    });
  }
};

// --------------------------------------------------
// Delete Image
// DELETE /admin/cdn/images/:id
// --------------------------------------------------

export const deleteCdnImage = async (req, res) => {
  try {
    const { id } = req.params;

    const image = await ImageCDN.findById(id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Build physical path from filename
    const filePath = path.join(uploadDir, image.filename);

    // Delete physical image
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    // Delete MongoDB record
    await ImageCDN.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("CDN delete error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete image",
    });
  }
};
