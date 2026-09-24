import { Request, Response, NextFunction } from "express";
import multer from "multer";

// Catches errors passed to next(err) — mainly multer upload errors and malformed JSON —
// and answers in our { error: { message, code } } format instead of Express's HTML page.
// Must be registered AFTER all routes in app.ts (Express knows it's an error handler
// because it has 4 parameters).
const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
    // Multer errors: file too big, unexpected field name, too many files...
    if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_FILE_SIZE"
            ? "Image must be 5 MB or smaller"
            : err.message;
        return res.status(400).json({ error: { message, code: err.code } });
    }

    // Our own fileFilter error (see upload.image.ts)
    if (err.code === "INVALID_FILE_TYPE") {
        return res.status(400).json({ error: { message: err.message, code: err.code } });
    }

    // express.json() could not parse the request body
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: { message: "Invalid JSON body", code: "INVALID_JSON" } });
    }

    // Anything else: log it, but never send its details to the client
    console.error("Unhandled error:", err);
    res.status(500).json({ error: { message: "Something went wrong", code: "INTERNAL_ERROR" } });
};

export default errorMiddleware;
