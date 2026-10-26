import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    employees: { findUnique: vi.fn() },
    orders: { findMany: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

import { myCashierOrWaitressHistory } from "../../source/pos/pos.service.js";
import { mockReq, mockRes } from "../helpers/http.js";

// Only the role checks are tested here. The query itself uses cashierEmail / employeeEmail,
// which were dropped from Orders; the new query (through OrderStatusHistory) is still to be decided.
beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("myCashierOrWaitressHistory", () => {
    it("answers 400 without an email in the token", async () => {
        const res = mockRes();

        await myCashierOrWaitressHistory(mockReq({ user: { Id: "", role: "CASHIER" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("answers 404 when the employee does not exist", async () => {
        prismaMock.employees.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await myCashierOrWaitressHistory(mockReq({ user: { Id: "x@yousracompany.com", role: "CASHIER" } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it.each(["KITCHEN_CHEF", "DELIVERY_DRIVER", "ADMIN"])("answers 403 for a %s", async (role) => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: "x@yousracompany.com", role });
        const res = mockRes();

        await myCashierOrWaitressHistory(mockReq({ user: { Id: "x@yousracompany.com", role } }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prismaMock.orders.findMany).not.toHaveBeenCalled();
    });

    it.each(["CASHIER", "WAITER"])("answers 200 for a %s", async (role) => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: "x@yousracompany.com", role });
        prismaMock.orders.findMany.mockResolvedValue([]);
        const res = mockRes();

        await myCashierOrWaitressHistory(mockReq({ user: { Id: "x@yousracompany.com", role } }), res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});
