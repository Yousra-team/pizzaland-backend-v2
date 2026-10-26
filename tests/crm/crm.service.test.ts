import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    favorites: { upsert: vi.fn() },
    reviews: { create: vi.fn() },
    userPreferences: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    customers: { findUnique: vi.fn(), update: vi.fn() },
    accounts: { create: vi.fn() },
    pointsTransaction: { create: vi.fn() },
    $transaction: vi.fn(),
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

// Keep the real coin conversions, fake only the wallet writes (they have their own tests)
vi.mock("../../source/crm/account.js", async (importOriginal) => {
    const real = await importOriginal<typeof import("../../source/crm/account.js")>();
    return { ...real, debitAccount: vi.fn(), creditAccount: vi.fn() };
});

import {
    addFavorite,
    addReview,
    addUserPreference,
    myBalance,
    sendYousraCoins,
    updateMyProfile,
    OpenMyAccount,
} from "../../source/crm/crm.service.js";
import { debitAccount, creditAccount } from "../../source/crm/account.js";
import { mockReq, mockRes } from "../helpers/http.js";

const customer = { Id: "cust_1", role: "CUSTOMER" };

beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

// P2003 = foreign key failed: the productId points to no product
const foreignKeyError = Object.assign(new Error("FK"), { code: "P2003" });

describe("addFavorite", () => {
    it("upserts on (customerId, productId) so favoriting twice is harmless", async () => {
        prismaMock.favorites.upsert.mockResolvedValue({ id: "fav_1" });
        const res = mockRes();

        await addFavorite(mockReq({ user: customer, body: { productId: "p1" } }), res);

        expect(prismaMock.favorites.upsert).toHaveBeenCalledWith({
            where: { customerId_productId: { customerId: "cust_1", productId: "p1" } },
            update: {},
            create: { productId: "p1", customerId: "cust_1" },
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("answers 404 when the product does not exist", async () => {
        prismaMock.favorites.upsert.mockRejectedValue(foreignKeyError);
        const res = mockRes();

        await addFavorite(mockReq({ user: customer, body: { productId: "nope" } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("answers 500 for other database errors", async () => {
        prismaMock.favorites.upsert.mockRejectedValue(new Error("db down"));
        const res = mockRes();

        await addFavorite(mockReq({ user: customer, body: { productId: "p1" } }), res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe("addReview", () => {
    // The customer comes from the token: a body customerId must not let you review as someone else
    it("takes the customer from the token, not the body", async () => {
        prismaMock.reviews.create.mockResolvedValue({});

        await addReview(mockReq({ user: customer, body: { productId: "p1", rating: 5, customerId: "someone_else" } }), mockRes());

        expect(prismaMock.reviews.create.mock.calls[0][0].data.customerId).toBe("cust_1");
    });

    it("answers 404 when the product does not exist", async () => {
        prismaMock.reviews.create.mockRejectedValue(foreignKeyError);
        const res = mockRes();

        await addReview(mockReq({ user: customer, body: { productId: "nope", rating: 5 } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("addUserPreference", () => {
    const body = { name: "preferredLanguage", value: "fr" };

    it.each([
        ["a customer", customer, { customerId: "cust_1" }],
        ["an employee", { Id: "awa@yousracompany.com", role: "CASHIER" }, { employeeEmail: "awa@yousracompany.com" }],
    ])("saves the preference for %s", async (_label, user, owner) => {
        prismaMock.userPreferences.findFirst.mockResolvedValue(null);
        const res = mockRes();

        await addUserPreference(mockReq({ user, body }), res);

        expect(prismaMock.userPreferences.create).toHaveBeenCalledWith({ data: { ...body, ...owner } });
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("updates the existing value instead of creating a second one", async () => {
        prismaMock.userPreferences.findFirst.mockResolvedValue({ id: "pref_1" });
        const res = mockRes();

        await addUserPreference(mockReq({ user: customer, body }), res);

        expect(prismaMock.userPreferences.update).toHaveBeenCalledWith({ where: { id: "pref_1" }, data: { value: "fr" } });
        expect(prismaMock.userPreferences.create).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe("myBalance", () => {
    it("answers 404 when the customer does not exist", async () => {
        prismaMock.customers.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await myBalance(mockReq({ user: customer }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("answers 400 when the customer has no account", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_1", accounts: null });
        const res = mockRes();

        await myBalance(mockReq({ user: customer }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns the balance in coins and in XAF", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_1", accounts: { balance: 40 } });
        const res = mockRes();

        await myBalance(mockReq({ user: customer }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ XAF: 1000, Yousra: 40 });
    });

    // balance is a Float: `!0` is true, so an empty wallet is treated as "no account"
    it("BUG #14: shows a balance of 0 instead of an error", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_1", accounts: { balance: 0 } });
        const res = mockRes();

        await myBalance(mockReq({ user: customer }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ XAF: 0, Yousra: 0 });
    });
});

describe("sendYousraCoins", () => {
    const body = { customerPhone: "+237699000000", amount: 10, format: "yousra" };

    beforeEach(() => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_2" });
    });

    it("answers 400 for an invalid body", async () => {
        const res = mockRes();

        await sendYousraCoins(mockReq({ user: customer, body: { ...body, amount: -1 } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("debits the sender, credits the receiver and writes the ledger in one transaction", async () => {
        const res = mockRes();

        await sendYousraCoins(mockReq({ user: customer, body }), res);

        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        // both wallet calls got the transaction client, so they roll back together
        expect(debitAccount).toHaveBeenCalledWith("cust_1", 10, prismaMock);
        expect(creditAccount).toHaveBeenCalledWith("cust_2", 10, prismaMock);
        expect(prismaMock.pointsTransaction.create).toHaveBeenCalledWith({
            data: { amount: 10, fromCustomerId: "cust_1", toCustomerId: "cust_2" },
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("converts an XAF amount into coins first", async () => {
        await sendYousraCoins(mockReq({ user: customer, body: { ...body, amount: 1000, format: "xaf" } }), mockRes());

        expect(debitAccount).toHaveBeenCalledWith("cust_1", 40, prismaMock); // 1000 / 25
    });

    it("answers 400 when the XAF amount is worth 0 coins", async () => {
        const res = mockRes();

        await sendYousraCoins(mockReq({ user: customer, body: { ...body, amount: 0.1, format: "xaf" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(debitAccount).not.toHaveBeenCalled();
    });

    it("answers 404 when nobody has the receiver's phone", async () => {
        prismaMock.customers.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await sendYousraCoins(mockReq({ user: customer, body }), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(debitAccount).not.toHaveBeenCalled();
    });

    it("answers 400 when sending to yourself", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_1" });
        const res = mockRes();

        await sendYousraCoins(mockReq({ user: customer, body }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(debitAccount).not.toHaveBeenCalled();
    });

    it.each([
        ["Insufficient balance", 400],
        ["Account not found", 404],
    ])("answers for wallet error '%s' with %s", async (message, status) => {
        vi.mocked(debitAccount).mockRejectedValue(new Error(message));
        const res = mockRes();

        await sendYousraCoins(mockReq({ user: customer, body }), res);

        expect(res.status).toHaveBeenCalledWith(status);
    });

    it("answers 500 for any other error", async () => {
        vi.mocked(creditAccount).mockRejectedValue(new Error("db down"));
        const res = mockRes();

        await sendYousraCoins(mockReq({ user: customer, body }), res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe("updateMyProfile", () => {
    it("answers 401 without a logged-in customer", async () => {
        const res = mockRes();

        await updateMyProfile(mockReq({ body: { firstName: "Awa" } }), res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(prismaMock.customers.update).not.toHaveBeenCalled();
    });

    it("only updates the logged-in customer", async () => {
        prismaMock.customers.update.mockResolvedValue({});

        await updateMyProfile(mockReq({ user: customer, body: { firstName: "Awa" } }), mockRes());

        expect(prismaMock.customers.update).toHaveBeenCalledWith({ where: { customerId: "cust_1" }, data: { firstName: "Awa" } });
    });
});

describe("OpenMyAccount", () => {
    it("answers 400 when the customer already has an account", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_1", accounts: { balance: 5 } });
        const res = mockRes();

        await OpenMyAccount(mockReq({ user: customer }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.accounts.create).not.toHaveBeenCalled();
    });

    it("opens an account with 20 coins", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_1", accounts: null });
        const res = mockRes();

        await OpenMyAccount(mockReq({ user: customer }), res);

        expect(prismaMock.accounts.create).toHaveBeenCalledWith({ data: { customerId: "cust_1", balance: 20 } });
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
