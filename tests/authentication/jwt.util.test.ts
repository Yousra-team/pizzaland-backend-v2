import { describe, it, expect, vi, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "../../source/authentication/jwt.util.js";

const payload = { Id: "cust_1", role: "CUSTOMER" };

afterEach(() => {
    vi.useRealTimers();
});

// Reads exp - iat from a token, in seconds
const lifetimeOf = (token: string) => {
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    return decoded.exp - decoded.iat;
};

describe("access tokens", () => {
    it("keep Id and role after a sign -> verify round trip", () => {
        const decoded = verifyAccessToken(signAccessToken(payload));
        expect(decoded.Id).toBe("cust_1");
        expect(decoded.role).toBe("CUSTOMER");
    });

    // The frontend refreshes on 401 every 15 minutes (FRONTEND_API_CONVENTIONS §2). The code says "2h"
    it("BUG #9: last 15 minutes", () => {
        expect(lifetimeOf(signAccessToken(payload))).toBe(15 * 60);
    });

    it("are rejected once expired", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
        const token = signAccessToken(payload);

        vi.setSystemTime(new Date("2026-10-25T10:00:00Z")); // a day later
        expect(() => verifyAccessToken(token)).toThrow();
    });

    // Changing the role inside the token (e.g. CUSTOMER -> ADMIN) breaks the signature
    it("are rejected when tampered with", () => {
        const [header, , signature] = signAccessToken(payload).split(".");
        const fakeBody = Buffer.from(JSON.stringify({ Id: "cust_1", role: "ADMIN" })).toString("base64url");
        expect(() => verifyAccessToken(`${header}.${fakeBody}.${signature}`)).toThrow();
    });

    it("cannot be used as refresh tokens (different secrets)", () => {
        expect(() => verifyRefreshToken(signAccessToken(payload))).toThrow();
    });
});

describe("refresh tokens", () => {
    it("last 7 days", () => {
        expect(lifetimeOf(signRefreshToken(payload))).toBe(7 * 24 * 60 * 60);
    });

    it("cannot be used as access tokens", () => {
        expect(() => verifyAccessToken(signRefreshToken(payload))).toThrow();
    });

    it("keep Id and role after a sign -> verify round trip", () => {
        expect(verifyRefreshToken(signRefreshToken(payload)).Id).toBe("cust_1");
    });
});

// Starting the server without secrets must fail loudly instead of signing with "undefined"
describe("module import", () => {
    it.each(["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"])("throws when %s is missing", async (name) => {
        const saved = process.env[name];
        delete process.env[name];
        vi.resetModules(); // forget the cached module so the import runs its top-level code again

        try {
            await expect(import("../../source/authentication/jwt.util.js")).rejects.toThrow(name);
        } finally {
            process.env[name] = saved;
        }
    });
});
