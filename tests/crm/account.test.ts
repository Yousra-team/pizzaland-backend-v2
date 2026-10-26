import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    accounts: { updateMany: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

import {
    convertToYousraCoins,
    convertToCurrency,
    creditAccount,
    debitAccount,
    getAccountBalance,
} from "../../source/crm/account.js";

beforeEach(() => {
    vi.resetAllMocks();
});

// A second fake client, standing in for the `tx` of a $transaction
const makeTx = () => ({ accounts: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn() } });

describe("creditAccount", () => {
    it("increments the balance of the customer's account", async () => {
        prismaMock.accounts.updateMany.mockResolvedValue({ count: 1 });

        await creditAccount("cust_1", 40);

        expect(prismaMock.accounts.updateMany).toHaveBeenCalledWith({
            where: { customerId: "cust_1" },
            data: { balance: { increment: 40 } },
        });
    });

    // Inside placeOrder the credit must be part of the order's transaction, so it rolls back with it
    it("uses the transaction client when one is given", async () => {
        const tx = makeTx();

        await creditAccount("cust_1", 40, tx as any);

        expect(tx.accounts.updateMany).toHaveBeenCalled();
        expect(prismaMock.accounts.updateMany).not.toHaveBeenCalled();
    });

    it.each([0, -5])("throws for amount %s before touching the database", async (amount) => {
        await expect(creditAccount("cust_1", amount)).rejects.toThrow("Invalid input");
        expect(prismaMock.accounts.updateMany).not.toHaveBeenCalled();
    });

    it("throws 'Account not found' when no account was updated", async () => {
        prismaMock.accounts.updateMany.mockResolvedValue({ count: 0 });

        await expect(creditAccount("cust_1", 40)).rejects.toThrow("Account not found");
    });
});

describe("debitAccount", () => {
    // The balance check is inside the update itself, so two parallel debits can't both pass it
    it("only decrements when the balance is high enough", async () => {
        prismaMock.accounts.updateMany.mockResolvedValue({ count: 1 });

        await debitAccount("cust_1", 40);

        expect(prismaMock.accounts.updateMany).toHaveBeenCalledWith({
            where: { customerId: "cust_1", balance: { gte: 40 } },
            data: { balance: { decrement: 40 } },
        });
    });

    it("uses the transaction client when one is given", async () => {
        const tx = makeTx();

        await debitAccount("cust_1", 40, tx as any);

        expect(tx.accounts.updateMany).toHaveBeenCalled();
        expect(prismaMock.accounts.updateMany).not.toHaveBeenCalled();
    });

    it("throws 'Insufficient balance' when the account exists but has too little", async () => {
        prismaMock.accounts.updateMany.mockResolvedValue({ count: 0 });
        prismaMock.accounts.findUnique.mockResolvedValue({ customerId: "cust_1", balance: 10 });

        await expect(debitAccount("cust_1", 40)).rejects.toThrow("Insufficient balance");
    });

    it("throws 'Account not found' when there is no account", async () => {
        prismaMock.accounts.updateMany.mockResolvedValue({ count: 0 });
        prismaMock.accounts.findUnique.mockResolvedValue(null);

        await expect(debitAccount("cust_1", 40)).rejects.toThrow("Account not found");
    });

    it("throws for a negative amount (a negative debit would be a credit)", async () => {
        await expect(debitAccount("cust_1", -40)).rejects.toThrow("Invalid input");
        expect(prismaMock.accounts.updateMany).not.toHaveBeenCalled();
    });
});

describe("getAccountBalance", () => {
    it("returns the account", async () => {
        prismaMock.accounts.findUnique.mockResolvedValue({ customerId: "cust_1", balance: 20 });

        expect(await getAccountBalance("cust_1")).toEqual({ customerId: "cust_1", balance: 20 });
    });

    it("throws when there is no account", async () => {
        prismaMock.accounts.findUnique.mockResolvedValue(null);

        await expect(getAccountBalance("cust_1")).rejects.toThrow("Account not found");
    });
});

// The rate is read from the env on every call, so each test can change it.
// Put the setup.ts value back after each test so tests don't leak into each other.
afterEach(() => {
    process.env.YOUSRA_COINS_EXCHANGE_RATE = "25";
});

describe("convertToYousraCoins", () => {
    it("divides XAF by the exchange rate", () => {
        expect(convertToYousraCoins(1000)).toBe(40); // 1000 / 25
    });

    it("rounds to 2 decimal places", () => {
        process.env.YOUSRA_COINS_EXCHANGE_RATE = "3";
        expect(convertToYousraCoins(10)).toBe(3.33); // 3.333... -> 3.33
    });

    it("uses the rate from YOUSRA_COINS_EXCHANGE_RATE", () => {
        process.env.YOUSRA_COINS_EXCHANGE_RATE = "50";
        expect(convertToYousraCoins(1000)).toBe(20);
    });
});

describe("convertToCurrency", () => {
    it("multiplies coins by the exchange rate", () => {
        expect(convertToCurrency(40)).toBe(1000);
    });

    it("rounds to 2 decimal places", () => {
        process.env.YOUSRA_COINS_EXCHANGE_RATE = "1.333";
        expect(convertToCurrency(1)).toBe(1.33);
    });

    it("gives back the original amount after a round trip", () => {
        expect(convertToCurrency(convertToYousraCoins(2500))).toBe(2500);
    });
});

// A wrong rate in Doppler must never turn into "free" or negative coins
describe("exchange rate fallback", () => {
    it.each([
        ["missing", undefined],
        ["not a number", "abc"],
        ["zero", "0"],
        ["negative", "-10"],
    ])("falls back to 25 when the rate is %s", (_label, value) => {
        if (value === undefined) {
            delete process.env.YOUSRA_COINS_EXCHANGE_RATE;
        } else {
            process.env.YOUSRA_COINS_EXCHANGE_RATE = value;
        }

        expect(convertToYousraCoins(1000)).toBe(40);
        expect(convertToCurrency(40)).toBe(1000);
    });
});
