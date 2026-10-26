import { describe, it, expect, vi } from "vitest";
import roleMiddleware from "../../source/middlewares/role.middleware.js";
import { mockReq, mockRes } from "../helpers/http.js";

describe("roleMiddleware", () => {
    const onlyStaff = roleMiddleware("CASHIER", "MANAGER");

    it("answers 401 when no user is logged in", () => {
        const res = mockRes();
        const next = vi.fn();

        onlyStaff(mockReq(), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("answers 403 when the user has no role", () => {
        const res = mockRes();
        const next = vi.fn();

        onlyStaff(mockReq({ user: { Id: "x", role: null } }), res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("answers 403 when the role is not allowed", () => {
        const res = mockRes();
        const next = vi.fn();

        onlyStaff(mockReq({ user: { Id: "x", role: "CUSTOMER" } }), res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(["CASHIER", "MANAGER"])("calls next() for allowed role %s", (role) => {
        const res = mockRes();
        const next = vi.fn();

        onlyStaff(mockReq({ user: { Id: "x", role } }), res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });
});
