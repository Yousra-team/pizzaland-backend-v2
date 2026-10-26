import { describe, it, expect, vi, beforeEach } from "vitest";
import multer from "multer";
import errorMiddleware from "../../source/middlewares/error.middleware.js";
import { mockReq, mockRes } from "../helpers/http.js";

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // keep the test output clean
});

describe("errorMiddleware", () => {
    it("turns a file-too-big error into a 400 with a readable message", () => {
        const res = mockRes();

        errorMiddleware(new multer.MulterError("LIMIT_FILE_SIZE"), mockReq(), res, vi.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: { message: "Image must be 5 MB or smaller", code: "LIMIT_FILE_SIZE" } });
    });

    it("turns other multer errors into a 400 with their code", () => {
        const res = mockRes();

        errorMiddleware(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "photo"), mockReq(), res, vi.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].error.code).toBe("LIMIT_UNEXPECTED_FILE");
    });

    it("turns our fileFilter error into a 400", () => {
        const res = mockRes();
        const err: any = new Error("Only JPEG, PNG or WEBP images are allowed");
        err.code = "INVALID_FILE_TYPE";

        errorMiddleware(err, mockReq(), res, vi.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].error.code).toBe("INVALID_FILE_TYPE");
    });

    it("turns malformed JSON into a 400 INVALID_JSON", () => {
        const res = mockRes();

        errorMiddleware({ type: "entity.parse.failed" }, mockReq(), res, vi.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].error.code).toBe("INVALID_JSON");
    });

    // Raw error messages can contain SQL, file paths or secrets
    it("answers 500 for unknown errors without leaking their message", () => {
        const res = mockRes();

        errorMiddleware(new Error("password=hunter2 at db.ts:12"), mockReq(), res, vi.fn());

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: { message: "Something went wrong", code: "INTERNAL_ERROR" } });
    });
});
