import { describe, it, expect, vi } from "vitest";
import authMiddleware from "../../source/middlewares/auth.middleware.js";
import { signAccessToken, signRefreshToken } from "../../source/authentication/jwt.util.js";
import { mockReq, mockRes } from "../helpers/http.js";

describe("authMiddleware", () => {
    it("answers 401 when there is no Authorization header", () => {
        const res = mockRes();
        const next = vi.fn();

        authMiddleware(mockReq(), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("answers 401 when the header has no token after 'Bearer'", () => {
        const res = mockRes();
        const next = vi.fn();

        authMiddleware(mockReq({ headers: { authorization: "Bearer" } }), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("answers 401 for an invalid token", () => {
        const res = mockRes();
        const next = vi.fn();

        authMiddleware(mockReq({ headers: { authorization: "Bearer not-a-jwt" } }), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    // A stolen refresh token (7 days) must not work as an access token
    it("answers 401 for a refresh token", () => {
        const res = mockRes();
        const next = vi.fn();
        const token = signRefreshToken({ Id: "cust_1", role: "CUSTOMER" });

        authMiddleware(mockReq({ headers: { authorization: `Bearer ${token}` } }), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("sets req.user and calls next() once for a valid token", () => {
        const req = mockReq({ headers: { authorization: `Bearer ${signAccessToken({ Id: "a@b.com", role: "CASHIER" })}` } });
        const res = mockRes();
        const next = vi.fn();

        authMiddleware(req, res, next);

        expect(req.user).toMatchObject({ Id: "a@b.com", role: "CASHIER" });
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });
});
