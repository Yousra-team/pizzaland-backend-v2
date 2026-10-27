import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    orders: { findUnique: vi.fn() },
    payments: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

// Monetbil is reached through axios.post: fake it so no real payment is ever started
const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

vi.mock("../../source/utilities/counter.js", () => ({ CreateIdentifier: vi.fn() }));

import { initiatePayment, notifyPayment, isMyOrderPaid, CreatePayment } from "../../source/payments/payment.js";
import { CreateIdentifier } from "../../source/utilities/counter.js";
import { mockReq, mockRes } from "../helpers/http.js";

// A tiny fake "payments table": findMany applies the status filter like the database would,
// so a test can tell WHICH payments the code counted, not just how many rows came back
type Row = { amount: number; status: string };
const paymentsInDb = (rows: Row[]) => {
    prismaMock.payments.findMany.mockImplementation(({ where }: any) => {
        const wanted = where?.status;
        return Promise.resolve(rows.filter((row) => {
            if (wanted === undefined) return true;
            if (typeof wanted === "string") return row.status === wanted;
            if (wanted.in) return wanted.in.includes(row.status);
            if (wanted.not) return row.status !== wanted.not;
            return true;
        }));
    });
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(CreateIdentifier).mockResolvedValue("PAYMENT-PZ20261024-0001");
});

describe("initiatePayment (Monetbil online payment)", () => {
    const body = { user: "Awa", phone: "+237677123456", orderNumber: "ORD-1", amount: 5000, operator: "CM_ORANGEMONEY", locale: "fr" };

    // A 10 000 XAF order, with nothing paid yet, and Monetbil answering with a link
    beforeEach(() => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", total: 10000 });
        paymentsInDb([]);
        axiosPost.mockResolvedValue({ data: { payment_url: "https://pay.test/abc" } });
    });

    it("answers 400 for an invalid body", async () => {
        const res = mockRes();

        await initiatePayment(mockReq({ body: { ...body, amount: -1 } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(axiosPost).not.toHaveBeenCalled();
    });

    it("answers 400 for an operator Monetbil doesn't support", async () => {
        const res = mockRes();

        await initiatePayment(mockReq({ body: { ...body, operator: "PAYPAL" } }), res);

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

    it("answers 400 when paid payments already cover the total", async () => {
        paymentsInDb([{ amount: 6000, status: "paid" }, { amount: 4000, status: "paid" }]);
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/already been paid/);
        expect(axiosPost).not.toHaveBeenCalled();
    });

    it("answers 400 when the payment would go over the total", async () => {
        paymentsInDb([{ amount: 6000, status: "paid" }]);
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res); // 6000 + 5000 > 10000

        expect(res.status).toHaveBeenCalledWith(400);
        expect(axiosPost).not.toHaveBeenCalled();
    });

    it("accepts a payment that exactly completes the total", async () => {
        paymentsInDb([{ amount: 5000, status: "paid" }]);
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it.each([
        ["CM_ORANGEMONEY", "ORANGE_MONEY_ONLINE"],
        ["CM_MTNMOBILEMONEY", "MOMO_ONLINE"],
    ])("saves operator %s as method %s", async (operator, method) => {
        await initiatePayment(mockReq({ body: { ...body, operator } }), mockRes());

        expect(prismaMock.payments.create.mock.calls[0][0].data.method).toBe(method);
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

    // MONEY: only "paid" rows are counted, so a customer who opens the payment page twice
    // (two tabs, or a retry) gets two Monetbil links for the full amount, and both can succeed.
    it("BUG #18: refuses a new payment while a pending one already covers the rest", async () => {
        paymentsInDb([{ amount: 10000, status: "pending" }]);
        const res = mockRes();

        await initiatePayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(axiosPost).not.toHaveBeenCalled();
    });
});

describe("notifyPayment (Monetbil webhook)", () => {
    const body = { service: "test-monetbil-key", amount: 5000, status: "success", payment_ref: "PAY-1" };

    beforeEach(() => {
        prismaMock.payments.findUnique.mockResolvedValue({ id: "PAY-1", status: "pending", amount: 5000 });
    });

    // Anyone can call the webhook URL: without this check they could mark orders as paid
    it("answers 403 and changes nothing when the service key is wrong", async () => {
        const res = mockRes();

        await notifyPayment(mockReq({ body: { ...body, service: "fake" } }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prismaMock.payments.update).not.toHaveBeenCalled();
        expect(prismaMock.payments.delete).not.toHaveBeenCalled();
    });

    it("marks the payment paid on success", async () => {
        const res = mockRes();

        await notifyPayment(mockReq({ body }), res);

        expect(prismaMock.payments.update).toHaveBeenCalledWith({ where: { id: "PAY-1" }, data: { status: "paid" } });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // A failed or cancelled attempt is removed, so it no longer blocks the order
    it.each(["failed", "cancelled"])("deletes the payment when Monetbil says %s", async (status) => {
        const res = mockRes();

        await notifyPayment(mockReq({ body: { ...body, status } }), res);

        expect(prismaMock.payments.delete).toHaveBeenCalledWith({ where: { id: "PAY-1" } });
        expect(prismaMock.payments.update).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("answers 200 without changes for an unknown payment reference", async () => {
        prismaMock.payments.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await notifyPayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(prismaMock.payments.update).not.toHaveBeenCalled();
        expect(prismaMock.payments.delete).not.toHaveBeenCalled();
    });

    // Monetbil retries webhooks: a late "failed" must not delete a payment that is already paid
    it("does not touch a payment that is already paid", async () => {
        prismaMock.payments.findUnique.mockResolvedValue({ id: "PAY-1", status: "paid", amount: 5000 });
        const res = mockRes();

        await notifyPayment(mockReq({ body: { ...body, status: "failed" } }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(prismaMock.payments.update).not.toHaveBeenCalled();
        expect(prismaMock.payments.delete).not.toHaveBeenCalled();
    });

    it("leaves the payment alone for an unknown Monetbil status", async () => {
        const res = mockRes();

        await notifyPayment(mockReq({ body: { ...body, status: "weird" } }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(prismaMock.payments.update).not.toHaveBeenCalled();
        expect(prismaMock.payments.delete).not.toHaveBeenCalled();
    });

    it("still answers 200 when the database fails, so Monetbil stops retrying", async () => {
        prismaMock.payments.findUnique.mockRejectedValue(new Error("db down"));
        const res = mockRes();

        await notifyPayment(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    // MONEY: the service key travels in the public widget URL, so it is not a secret.
    // The amount the webhook reports must at least match what we asked the customer to pay.
    it("BUG #19: does not mark a payment paid when the reported amount doesn't match", async () => {
        const res = mockRes();

        await notifyPayment(mockReq({ body: { ...body, amount: 100 } }), res); // we expected 5000

        expect(prismaMock.payments.update).not.toHaveBeenCalledWith(
            expect.objectContaining({ data: { status: "paid" } }));
    });
});

describe("CreatePayment (cash / in-store payment)", () => {
    const body = { orderNumber: "ORD-1", amount: 5000, method: "CASH", provider: "POS" };

    beforeEach(() => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", total: 10000 });
        paymentsInDb([]);
        prismaMock.payments.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    });

    it("answers 400 for an unknown payment method", async () => {
        const res = mockRes();

        await CreatePayment(mockReq({ body: { ...body, method: "BITCOIN" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.payments.create).not.toHaveBeenCalled();
    });

    it("saves a paid payment with the counter id", async () => {
        const res = mockRes();

        await CreatePayment(mockReq({ body }), res);

        expect(prismaMock.payments.create).toHaveBeenCalledWith({
            data: { id: "PAYMENT-PZ20261024-0001", ...body, status: "paid" },
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Today any number can be marked as paid: there is no check that the order exists
    it("BUG #20: answers 404 and saves nothing when the order does not exist", async () => {
        prismaMock.orders.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await CreatePayment(mockReq({ body: { ...body, orderNumber: "ORD-404" } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(prismaMock.payments.create).not.toHaveBeenCalled();
    });

    // initiatePayment checks this; the cash path skips it, so an order can be "paid" twice
    it("BUG #20: answers 400 and saves nothing when the amount is more than what remains", async () => {
        paymentsInDb([{ amount: 8000, status: "paid" }]);
        const res = mockRes();

        await CreatePayment(mockReq({ body }), res); // 8000 + 5000 > 10000

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.payments.create).not.toHaveBeenCalled();
    });
});

describe("isMyOrderPaid", () => {
    it("answers 404 when the order does not exist", async () => {
        prismaMock.orders.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await isMyOrderPaid(mockReq({ params: { orderNumber: "ORD-1" } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    // A pending Monetbil attempt is not money received yet
    it("counts only paid payments, not pending ones", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", total: 10000 });
        paymentsInDb([{ amount: 4000, status: "paid" }, { amount: 6000, status: "pending" }]);
        const res = mockRes();

        await isMyOrderPaid(mockReq({ params: { orderNumber: "ORD-1" } }), res);

        expect(res.json).toHaveBeenCalledWith({ paid: false, totalPaid: 4000, total: 10000, remaining: 6000 });
    });

    it("reports a fully paid order", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", total: 10000 });
        paymentsInDb([{ amount: 10000, status: "paid" }]);
        const res = mockRes();

        await isMyOrderPaid(mockReq({ params: { orderNumber: "ORD-1" } }), res);

        expect(res.json.mock.calls[0][0]).toMatchObject({ paid: true, remaining: 0 });
    });
});
