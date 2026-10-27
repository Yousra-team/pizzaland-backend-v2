import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    employees: { findUnique: vi.fn() },
    orders: { findMany: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

import { myCashierOrWaitressHistory } from "../../source/pos/pos.service.js";
import { mockReq, mockRes } from "../helpers/http.js";

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

    // "Who placed the order" is the first history row: fromStatus null, changedByEmail = the employee.
    // Matching any history row instead would also list orders this person only moved to "ready".
    it.each(["CASHIER", "WAITER"])("lists the orders a %s placed, newest first", async (role) => {
        prismaMock.employees.findUnique.mockResolvedValue({ role });
        prismaMock.orders.findMany.mockResolvedValue([]);
        const res = mockRes();

        await myCashierOrWaitressHistory(mockReq({ user: { Id: "x@yousracompany.com", role } }), res);

        const query = prismaMock.orders.findMany.mock.calls[0][0];
        expect(query.where).toEqual({
            statusHistory: { some: { fromStatus: null, changedByEmail: "x@yousracompany.com" } },
        });
        expect(query.orderBy).toEqual({ createdAt: "desc" });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // The role comes from the database, not the token: a stale token can't keep old rights
    it("uses the role saved in the database, not the one in the token", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ role: "DELIVERY_DRIVER" });
        const res = mockRes();

        await myCashierOrWaitressHistory(mockReq({ user: { Id: "x@yousracompany.com", role: "CASHIER" } }), res);

        expect(res.status).toHaveBeenCalledWith(403);
    });
});
