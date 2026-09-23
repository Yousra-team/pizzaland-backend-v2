import multer from "multer";

export const upload = multer({
  storage: multer.memoryStorage(),          // file stays in RAM as a Buffer
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG or WEBP images are allowed"));
  },
});