import fs from "fs/promises";
import path from "path";
import SocialAllDump from "../models/SocialAllDump.js";
import sharp from "sharp";

// Media scraped from Instagram is cached locally on disk, served straight
// from the "public" static folder that Express already exposes. This is
// intentionally separate from the CDN image gallery (src/controllers/cdnControls.js
// + src/models/ImageCDN.js), which manages its own uploads under
// public/cdn/images and is NOT touched by this file or by the 90-day cleanup below.

const MEDIA_ROOT = path.join(process.cwd(), "public", "cdn", "instagram");

const MEDIA_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const getPublicBaseUrl = () =>
  `${req.protocol}://${req.get("host")}` || process.env.PUBLIC_URL;

let mediaSyncRunning = false;
let mediaCleanupRunning = false;

async function saveInstagramMediaLocally(creatorName, postId, media) {
  const response = await fetch(media.url);

  if (!response.ok) {
    throw new Error(`Download failed ${response.status}`);
  }

  let buffer = Buffer.from(await response.arrayBuffer());

  let extension = media.type === "video" ? "mp4" : "jpg";

  if (media.type === "image") {
    buffer = await sharp(buffer)
      .rotate()
      .resize({
        width: 1280,
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 65,
        mozjpeg: true,
      })
      .toBuffer();
  }

  const relativePath = path.join(
    "instagram",
    creatorName,
    String(postId),
    `${media.type}.${extension}`,
  );

  const absolutePath = path.join(process.cwd(), "public", "cdn", relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  await fs.writeFile(absolutePath, buffer);

  // Normalize to forward slashes for the URL regardless of host OS.
  const urlPath = relativePath.split(path.sep).join("/");

  return `${getPublicBaseUrl()}/cdn/${urlPath}`;
}

export async function syncInstagramMedia() {
  if (mediaSyncRunning) {
    console.log("Media sync already running");
    return;
  }

  mediaSyncRunning = true;

  try {
    console.log("Starting media sync");

    const dumps = await SocialAllDump.find({
      updatedAt: {
        $gte: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
      instagram: {
        $exists: true,
        $ne: [],
      },
    });

    for (const dump of dumps) {
      let modified = false;

      for (const post of dump.instagram || []) {
        for (const [mediaIndex, media] of (post.media || []).entries()) {
          if (media.cdnUrl && (!media.poster || media.cdnPoster)) {
            continue;
          }

          try {
            if (!media.cdnUrl && media.url) {
              media.cdnUrl = await saveInstagramMediaLocally(
                dump.creatorName,
                `${post.postId}/${mediaIndex}`,
                media,
              );

              modified = true;
            }

            if (media.poster && !media.cdnPoster) {
              const posterMedia = {
                url: media.poster,
                type: "image",
              };

              media.cdnPoster = await saveInstagramMediaLocally(
                dump.creatorName,
                `${post.postId}/${mediaIndex}/poster`,
                posterMedia,
              );

              modified = true;
            }

            media.uploadedAt = new Date();

            console.log(
              `Saved ${dump.creatorName}/${post.postId}/${mediaIndex}`,
            );
          } catch (err) {
            console.log("Save failed", dump.creatorName, err.message);
          }
        }
      }

      if (modified) {
        dump.markModified("instagram");

        await dump.save();
      }
    }

    console.log("Media sync completed");
  } catch (err) {
    console.error("Media sync failed", err);
  } finally {
    mediaSyncRunning = false;
  }
}

// -----------------------------------------------------------------------
// 90-day cleanup for locally-cached Instagram media.
//
// Scoped to Instagram-scraped media only (the `instagram.*.media[].cdnUrl` /
// `cdnPoster` files this worker writes under public/cdn/instagram/). It never
// touches public/cdn/images, which belongs to the CDN image gallery feature.
// -----------------------------------------------------------------------

async function deleteLocalMediaFile(url) {
  if (!url) return;

  const marker = "/cdn/instagram/";
  const idx = url.indexOf(marker);

  if (idx === -1) return;

  const relativePath = url.slice(idx + marker.length);

  const absolutePath = path.join(MEDIA_ROOT, relativePath);

  try {
    await fs.unlink(absolutePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
}

export async function cleanupOldInstagramMedia() {
  if (mediaCleanupRunning) {
    console.log("Media cleanup already running");
    return;
  }

  mediaCleanupRunning = true;

  try {
    console.log("Starting 90-day Instagram media cleanup");

    const cutoff = new Date(Date.now() - MEDIA_MAX_AGE_MS);

    const dumps = await SocialAllDump.find({
      instagram: {
        $exists: true,
        $ne: [],
      },
    });

    let deletedCount = 0;

    for (const dump of dumps) {
      let modified = false;

      for (const post of dump.instagram || []) {
        for (const media of post.media || []) {
          if (!media.cdnUrl && !media.cdnPoster) {
            continue;
          }

          if (!media.uploadedAt || new Date(media.uploadedAt) > cutoff) {
            continue;
          }

          try {
            await deleteLocalMediaFile(media.cdnUrl);
            await deleteLocalMediaFile(media.cdnPoster);

            // Fall back to the original scraped url (normalizer.js already
            // prefers cdnUrl/cdnPoster when present, and the raw url otherwise).
            media.cdnUrl = null;
            media.cdnPoster = null;
            media.uploadedAt = null;

            modified = true;
            deletedCount += 1;
          } catch (err) {
            console.log("Cleanup failed", dump.creatorName, err.message);
          }
        }
      }

      if (modified) {
        dump.markModified("instagram");

        await dump.save();
      }
    }

    console.log(`Media cleanup completed, removed ${deletedCount} file(s)`);
  } catch (err) {
    console.error("Media cleanup failed", err);
  } finally {
    mediaCleanupRunning = false;
  }
}
