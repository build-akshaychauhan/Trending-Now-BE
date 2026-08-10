import multer from "multer";

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

export const uploadImage = multer({
  storage: multer.memoryStorage(),

  fileFilter,

  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB original image limit
  },
});
