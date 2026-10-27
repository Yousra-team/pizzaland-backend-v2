import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    employees: { findUnique: vi.fn(), findMany: vi.fn() },
    deliveries: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    orders: { update: vi.fn() },
    orderStatusHistory: { create: vi.fn() },
    $transaction: vi.fn(),
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

import {
    getAvailableDeliveries,
    assignDeliveryToDriver,
    findDrivers,
    claimDelivery,
    getMyDeliveries,
    updateDeliveryStatus,
} from "../../source/delivery/delivery.service.js";
import { mockReq, mockRes } from "../helpers/http.js";

const driver = { Id: "driver@yousracompany.com", role: "DELIVERY_DRIVER" };

beforeEach(() => {
    vi.resetAllMocks();
    // $transaction(cb) runs cb with the same fake, so tx.x and prisma.x are the same mock
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getAvailableDeliveries", () => {
    it("answers 401 without a logged-in email", async () => {
        const res = mockRes();

        await getAvailableDeliveries(mockReq({ user: { Id: "", role: "DELIVERY_DRIVER" } }), res);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it("answers 403 when the driver has no branch", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ branchId: null });
        const res = mockRes();

        await getAvailableDeliveries(mockReq({ user: driver }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prismaMock.deliveries.findMany).not.toHaveBeenCalled();
    });

    it("only lists unclaimed pending deliveries of the driver's branch", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ branchId: "br_1" });
        prismaMock.deliveries.findMany.mockResolvedValue([]);
        const res = mockRes();

        await getAvailableDeliveries(mockReq({ user: driver }), res);

        expect(prismaMock.deliveries.findMany.mock.calls[0][0].where).toEqual({
            driverEmail: null,
            status: "pending",
            order: { branchId: "br_1" },
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe("assignDeliveryToDriver", () => {
    const body = { email: "driver@yousracompany.com", order: "ORD-1" };

    it("answers 400 for an invalid body", async () => {
        const res = mockRes();

        await assignDeliveryToDriver(mockReq({ body: { email: "nope" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("answers 400 when the email is not a delivery driver", async () => {
        prismaMock.employees.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await assignDeliveryToDriver(mockReq({ body }), res);

        expect(prismaMock.employees.findUnique).toHaveBeenCalledWith({ where: { email: body.email, role: "DELIVERY_DRIVER" } });
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.deliveries.update).not.toHaveBeenCalled();
    });

    it("answers 400 when the order has no pending delivery", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: body.email });
        prismaMock.deliveries.findFirst.mockResolvedValue(null);
        const res = mockRes();

        await assignDeliveryToDriver(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.deliveries.update).not.toHaveBeenCalled();
    });

    it("assigns the pending delivery to the driver", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: body.email });
        prismaMock.deliveries.findFirst.mockResolvedValue({ id: "DEL-1" });
        prismaMock.deliveries.update.mockResolvedValue({ id: "DEL-1" });
        const res = mockRes();

        await assignDeliveryToDriver(mockReq({ body }), res);

        expect(prismaMock.deliveries.update.mock.calls[0][0]).toMatchObject({
            where: { id: "DEL-1" },
            data: { driverEmail: body.email, status: "assigned" },
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe("findDrivers", () => {
    it("answers 400 when the cashier does not exist", async () => {
        prismaMock.employees.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await findDrivers(mockReq({ user: { Id: "cashier@yousracompany.com", role: "CASHIER" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("BUG #13: lists the drivers of the cashier's branch with a 200", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ branchId: "br_1" });
        prismaMock.employees.findMany.mockResolvedValue([]);
        const res = mockRes();

        await findDrivers(mockReq({ user: { Id: "cashier@yousracompany.com", role: "CASHIER" } }), res);

        expect(prismaMock.employees.findMany).toHaveBeenCalledWith({ where: { role: "DELIVERY_DRIVER", branchId: "br_1" } });
        expect(res.status).toHaveBeenCalledWith(200); // a GET that creates nothing is not a 201
    });
});

describe("claimDelivery", () => {
    const req = () => mockReq({ user: driver, params: { deliveryId: "DEL-1" } });

    beforeEach(() => {
        prismaMock.employees.findUnique.mockResolvedValue({ branchId: "br_1" });
        prismaMock.deliveries.findUnique.mockResolvedValue({ order: { branchId: "br_1" } });
        prismaMock.deliveries.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.deliveries.findUniqueOrThrow.mockResolvedValue({ id: "DEL-1" });
    });

    it("claims an unclaimed pending delivery", async () => {
        const res = mockRes();

        await claimDelivery(req(), res);

        // the conditions live in the update itself, so two drivers can't both win
        expect(prismaMock.deliveries.updateMany).toHaveBeenCalledWith({
            where: { id: "DEL-1", driverEmail: null, status: "pending" },
            data: { driverEmail: driver.Id, status: "assigned" },
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ data: { id: "DEL-1" } });
    });

    it("answers 403 when the driver has no branch", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ branchId: null });
        const res = mockRes();

        await claimDelivery(req(), res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("answers 404 when the delivery does not exist", async () => {
        prismaMock.deliveries.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await claimDelivery(req(), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("answers 403 when the delivery belongs to another branch", async () => {
        prismaMock.deliveries.findUnique.mockResolvedValue({ order: { branchId: "br_2" } });
        const res = mockRes();

        await claimDelivery(req(), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prismaMock.deliveries.updateMany).not.toHaveBeenCalled();
    });

    // The frontend refreshes its list on 409 (FRONTEND_API_CONVENTIONS)
    it("answers 409 when another driver claimed it first", async () => {
        prismaMock.deliveries.updateMany.mockResolvedValue({ count: 0 });
        const res = mockRes();

        await claimDelivery(req(), res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("answers 500 for a database error without sending its message", async () => {
        prismaMock.deliveries.updateMany.mockRejectedValue(new Error("connection reset by 10.0.0.3"));
        const res = mockRes();

        await claimDelivery(req(), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("10.0.0.3");
    });
});

describe("getMyDeliveries", () => {
    it("answers 401 without an email, so no driver ever sees all deliveries", async () => {
        const res = mockRes();

        await getMyDeliveries(mockReq({ user: { Id: "", role: "DELIVERY_DRIVER" } }), res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(prismaMock.deliveries.findMany).not.toHaveBeenCalled();
    });

    it.each([
        [undefined, ["assigned", "in_transit"]],
        ["history", ["delivered", "failed"]],
        ["anything", ["assigned", "in_transit"]],
    ])("view=%s lists statuses %j", async (view, statuses) => {
        prismaMock.deliveries.findMany.mockResolvedValue([]);

        await getMyDeliveries(mockReq({ user: driver, query: { view } }), mockRes());

        expect(prismaMock.deliveries.findMany.mock.calls[0][0].where).toEqual({
            driverEmail: driver.Id,
            status: { in: statuses },
        });
    });
});

describe("updateDeliveryStatus", () => {
    const req = (status: string) => mockReq({ user: driver, params: { deliveryId: "DEL-1" }, body: { status } });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
        prismaMock.deliveries.findUnique.mockResolvedValue({ driverEmail: driver.Id, orderNumber: "ORD-1" });
        prismaMock.deliveries.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.deliveries.findUniqueOrThrow.mockResolvedValue({ id: "DEL-1" });
        return () => vi.useRealTimers();
    });

    it("answers 400 for a status a driver can't set", async () => {
        const res = mockRes();

        await updateDeliveryStatus(req("pending"), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("in_transit is only allowed from assigned, and puts the order out_for_delivery", async () => {
        const res = mockRes();

        await updateDeliveryStatus(req("in_transit"), res);

        expect(prismaMock.deliveries.updateMany.mock.calls[0][0].where.status).toEqual({ in: ["assigned"] });
        expect(prismaMock.deliveries.updateMany.mock.calls[0][0].data).toEqual({ status: "in_transit", actualDeliveryTime: undefined });
        expect(prismaMock.orders.update).toHaveBeenCalledWith({ where: { number: "ORD-1" }, data: { status: "out_for_delivery" } });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("delivered is allowed from assigned or in_transit, records the time and marks the order delivered", async () => {
        await updateDeliveryStatus(req("delivered"), mockRes());

        const update = prismaMock.deliveries.updateMany.mock.calls[0][0];
        expect(update.where.status).toEqual({ in: ["assigned", "in_transit"] });
        expect(update.data.actualDeliveryTime).toEqual(new Date("2026-10-24T12:00:00Z"));
        expect(prismaMock.orders.update).toHaveBeenCalledWith({ where: { number: "ORD-1" }, data: { status: "delivered" } });
    });

    it("failed leaves the order status alone and records no delivery time", async () => {
        await updateDeliveryStatus(req("failed"), mockRes());

        expect(prismaMock.deliveries.updateMany.mock.calls[0][0].data.actualDeliveryTime).toBeUndefined();
        expect(prismaMock.orders.update).not.toHaveBeenCalled();
    });

    it("answers 404 when the delivery does not exist", async () => {
        prismaMock.deliveries.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await updateDeliveryStatus(req("delivered"), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("answers 403 when the delivery belongs to another driver", async () => {
        prismaMock.deliveries.findUnique.mockResolvedValue({ driverEmail: "other@yousracompany.com", orderNumber: "ORD-1" });
        const res = mockRes();

        await updateDeliveryStatus(req("delivered"), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prismaMock.deliveries.updateMany).not.toHaveBeenCalled();
    });

    // e.g. a delivery that is already delivered can't become failed afterwards
    it("answers 409 and leaves the order alone when the move is not allowed", async () => {
        prismaMock.deliveries.updateMany.mockResolvedValue({ count: 0 });
        const res = mockRes();

        await updateDeliveryStatus(req("failed"), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(prismaMock.orders.update).not.toHaveBeenCalled();
    });

    // The driver moves the ORDER too (out_for_delivery, delivered): that is an order status change,
    // so it belongs in the audit log like every other one (schema.prisma, OrderStatusHistory)
    it.each([
        ["in_transit", "out_for_delivery"],
        ["delivered", "delivered"],
    ])("BUG #16: records the order's move to %s in OrderStatusHistory", async (deliveryStatus, orderStatus) => {
        await updateDeliveryStatus(req(deliveryStatus), mockRes());

        expect(prismaMock.orderStatusHistory.create.mock.calls[0]?.[0].data).toMatchObject({
            orderNumber: "ORD-1",
            toStatus: orderStatus,
            changedByEmail: driver.Id,
        });
    });
});
