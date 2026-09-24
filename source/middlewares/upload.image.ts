import multer from "multer";

export const upload = multer({
  storage: multer.memoryStorage(),          // file stays in RAM as a Buffer
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // The code lets error.middleware.ts recognise this error and answer with a 400
      const error: any = new Error("Only JPEG, PNG or WEBP images are allowed");
      error.code = "INVALID_FILE_TYPE";
      cb(error);
    }
  },
});