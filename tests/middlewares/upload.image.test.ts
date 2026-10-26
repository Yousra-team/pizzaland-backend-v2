import { describe, it, expect, vi } from "vitest";
import { upload } from "../../source/middlewares/upload.image.js";

// multer keeps the options it was built with on the instance; the types just don't show them
const { fileFilter, limits } = upload as any;

const runFilter = (mimetype: string) => {
    const cb = vi.fn();
    fileFilter({}, { mimetype }, cb);
    return cb;
};

describe("upload (multer config)", () => {
    it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (mimetype) => {
        expect(runFilter(mimetype)).toHaveBeenCalledWith(null, true);
    });

    it.each(["image/gif", "application/pdf", "image/svg+xml"])("rejects %s with INVALID_FILE_TYPE", (mimetype) => {
        const error = runFilter(mimetype).mock.calls[0][0];

        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBe("INVALID_FILE_TYPE"); // error.middleware.ts relies on this code
    });

    it("limits files to 5 MB", () => {
        expect(limits.fileSize).toBe(5 * 1024 * 1024);
    });
});
