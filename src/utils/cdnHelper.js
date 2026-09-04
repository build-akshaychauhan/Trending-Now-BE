import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const REPORTS_CDN_DIR = path.join(process.cwd(), "public", "cdn", "reports");

export const addReportImage = async (file) => {
  if (!file) {
    throw new Error("Report image is required");
  }

  await fs.mkdir(REPORTS_CDN_DIR, { recursive: true });

  const filename = `report-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.webp`;

  const outputPath = path.join(REPORTS_CDN_DIR, filename);

  await sharp(file.buffer)
    .resize({
      width: 1600,
      withoutEnlargement: true,
    })
    .webp({
      quality: 60,
    })
    .toFile(outputPath);

  return {
    filename,
    path: outputPath,
    url: `/cdn/reports/${filename}`,
  };
};
