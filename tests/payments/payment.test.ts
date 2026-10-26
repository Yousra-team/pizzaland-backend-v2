import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    orders: { findUnique: vi.fn() },
    payments: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

// Monetbil is reached through axios.post: fake it so no real payment is ever started
const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

vi.mock("../../source/utilities/counter.js", () => ({ CreateIdentifier: vi.fn() }));

import { initiatePayment, notifyPayment, isMyOrderPaid } from "../../source/payments/payment.js";
import { CreateIdentifier } from "../../source/utilities/counter.js";
import { mockReq, mockRes } from "../helpers/http.js";

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("initiatePayment", () => {
    const body = { user: "Awa", phone: "+237677123456", orderNumber: "ORD-1", amount: 5000, operator: "OM", locale: "fr" };

    // A 10 000 XAF order, with nothing paid yet, and Monetbil answering with a link
    beforeEach(() => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", total: 10000 });
        prismaMock.payments.findMany.mockResolvedValue([]);
        vi.mocked(CreateIdentifier).mockResolvedValue("PAYMENT-PZ20261024-0001");
        axiosPost.mockResolvedValue({ data: { payment_url: "https://pay.test/abc" } });
    });

    it("answers 400 for an invalid body", async () => {
        const res = mockRes();

        await initiatePayment(mockReq({ body: { ...body, amount: -1 } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(axiosPost).not.toHaveBeenCalled();
    });

    it("answers 400 when the order does not exist", async () => {
        prismaMock.orders.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(axiosPost).not.toHaveBeenCalled();
    });

    it("answers 400 when the order is already fully paid", async () => {
        prismaMock.payments.findMany.mockResolvedValue([{ amount: 6000 }, { amount: 4000 }]);
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/already been paid/);
        expect(axiosPost).not.toHaveBeenCalled();
    });

    it("answers 400 when the payment would go over the total", async () => {
        prismaMock.payments.findMany.mockResolvedValue([{ amount: 6000 }]);
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res); // 6000 + 5000 > 10000

        expect(res.status).toHaveBeenCalledWith(400);
        expect(axiosPost).not.toHaveBeenCalled();
    });

    it("accepts a payment that exactly completes the total", async () => {
        prismaMock.payments.findMany.mockResolvedValue([{ amount: 5000 }]);
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it.each([
        ["OM", "ORANGE_MONEY_ONLINE"],
        ["MTN", "MOMO_ONLINE"],
    ])("saves operator %s as method %s", async (operator, method) => {
        await initiatePayment(mockReq({ body: { ...body, operator } }), mockRes());

        expect(prismaMock.payments.create.mock.calls[0][0].data.method).toBe(method);
    });

    it("answers 400 for an unsupported operator", async () => {
        const res = mockRes();

        await initiatePayment(mockReq({ body: { ...body, operator: "PAYPAL" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(axiosPost).not.toHaveBeenCalled();
    });

    it("creates a pending payment with the counter id and returns the payment url", async () => {
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res);

        expect(prismaMock.payments.create).toHaveBeenCalledWith({
            data: {
                id: "PAYMENT-PZ20261024-0001",
                orderNumber: "ORD-1",
                amount: 5000,
                method: "ORANGE_MONEY_ONLINE",
                provider: "MonetBil",
                status: "pending", // only the webhook may mark it paid
            },
        });
        // Monetbil gets the same id back in the webhook, that's how we find the payment again
        expect(axiosPost.mock.calls[0][1].payment_ref).toBe("PAYMENT-PZ20261024-0001");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ paymentUrl: "https://pay.test/abc" });
    });

    it("answers 500 and saves nothing when Monetbil returns no payment url", async () => {
        axiosPost.mockResolvedValue({ data: {} });
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(prismaMock.payments.create).not.toHaveBeenCalled();
    });

    it("answers 500 and saves nothing when Monetbil is unreachable", async () => {
        axiosPost.mockRejectedValue(new Error("timeout"));
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(prismaMock.payments.create).not.toHaveBeenCalled();
    });
});

describe("notifyPayment (Monetbil webhook)", () => {
    const body = { service: "test-monetbil-key", amount: 5000, status: "success", payment_ref: "PAY-1" };

    beforeEach(() => {
        prismaMock.payments.findUnique.mockResolvedValue({ id: "PAY-1", status: "pending" });
    });

    // Anyone can call the webhook URL: without this check they could mark orders as paid
    it("answers 403 and changes nothing when the service key is wrong", async () => {
        const res = mockRes();

        await notifyPayment(mockReq({ body: { ...body, service: "fake" } }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prismaMock.payments.update).not.toHaveBeenCalled();
    });

    it.each([
        ["success", "paid"],
        ["failed", "failed"],
        ["cancelled", "cancelled"],
    ])("maps Monetbil status %s to %s", async (status, newStatus) => {
        const res = mockRes();

        await notifyPayment(mockReq({ body: { ...body, status } }), res);

        expect(prismaMock.payments.update).toHaveBeenCalledWith({ where: { id: "PAY-1" }, data: { status: newStatus } });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("answers 200 without updating for an unknown payment reference", async () => {
        prismaMock.payments.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await notifyPayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(prismaMock.payments.update).not.toHaveBeenCalled();
    });

    // Monetbil retries webhooks: a second "failed" must not undo a "paid"
    it("does not touch a payment that is already finalized", async () => {
        prismaMock.payments.findUnique.mockResolvedValue({ id: "PAY-1", status: "paid" });
        const res = mockRes();

        await notifyPayment(mockReq({ body: { ...body, status: "failed" } }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(prismaMock.payments.update).not.toHaveBeenCalled();
    });

    it("answers 200 without updating for an unknown Monetbil status", async () => {
        const res = mockRes();

        await notifyPayment(mockReq({ body: { ...body, status: "weird" } }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(prismaMock.payments.update).not.toHaveBeenCalled();
    });

    it("still answers 200 when the database fails, so Monetbil stops retrying", async () => {
        prismaMock.payments.findUnique.mockRejectedValue(new Error("db down"));
        const res = mockRes();

        await notifyPayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe("isMyOrderPaid", () => {
    it("answers 404 when the order does not exist", async () => {
        prismaMock.orders.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await isMyOrderPaid(mockReq({ params: { orderNumber: "ORD-1" } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("only counts payments with status paid", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", total: 10000 });
        prismaMock.payments.findMany.mockResolvedValue([{ amount: 4000 }]);

        await isMyOrderPaid(mockReq({ params: { orderNumber: "ORD-1" } }), mockRes());

        expect(prismaMock.payments.findMany).toHaveBeenCalledWith({ where: { orderNumber: "ORD-1", status: "paid" } });
    });

    it("reports a partly paid order with what remains", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", total: 10000 });
        prismaMock.payments.findMany.mockResolvedValue([{ amount: 4000 }, { amount: 1000 }]);
        const res = mockRes();

        await isMyOrderPaid(mockReq({ params: { orderNumber: "ORD-1" } }), res);

        expect(res.json).toHaveBeenCalledWith({ paid: false, totalPaid: 5000, total: 10000, remaining: 5000 });
    });

    it("reports a fully paid order", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", total: 10000 });
        prismaMock.payments.findMany.mockResolvedValue([{ amount: 10000 }]);
        const res = mockRes();

        await isMyOrderPaid(mockReq({ params: { orderNumber: "ORD-1" } }), res);

        expect(res.json.mock.calls[0][0].paid).toBe(true);
    });
});
