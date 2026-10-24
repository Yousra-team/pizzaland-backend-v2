import { accountSchema , creditSchema } from "./crm.schema.js";
import { prisma } from '../lib/prisma.js';
import { Prisma } from "../generated/prisma/client.js";

// These helpers are called from other services (orders, payments), not directly by routes.
// They throw on failure; the calling controller turns the error into an HTTP response.
//
// Money uses Prisma.Decimal (exact base-10 math) instead of number (binary floating point,
// where 0.1 + 0.2 = 0.30000000000000004). The balance column is DECIMAL(14, 2).
export const creditAccount = async (
    customerId: string,
    amount: number,
    tx?: Prisma.TransactionClient
): Promise<void> => {
    const result = creditSchema.safeParse({ customerId, amount });
    if (!result.success) {
        throw new Error(`Invalid input: ${result.error.message}`);
    }

    // Use the transaction if we got one, otherwise the normal prisma
    const db = tx ?? prisma;

    const updated = await db.accounts.updateMany({
        where: { customerId: customerId },
        data: { balance: { increment: amount } },
    });

    if (updated.count === 0) {
        throw new Error("Account not found");
    }
};

export const debitAccount = async (
    customerId: string,
    amount: number,
    tx?: Prisma.TransactionClient
): Promise<void> => {
    const result = creditSchema.safeParse({ customerId, amount });
    if (!result.success) {
        throw new Error(`Invalid input: ${result.error.message}`);
    }

    const db = tx ?? prisma;

    const updated = await db.accounts.updateMany({
        where: { customerId: customerId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
    });

    if (updated.count === 0) {
        const account = await db.accounts.findUnique({
            where: { customerId: customerId }
        });
        if (account) {
            throw new Error("Insufficient balance");
        }
        throw new Error("Account not found");
    }
};

// Returns a Decimal: use .toString() to send it in JSON without losing precision
export const getAccountBalance = async (customerId: string) => {
    const account = await prisma.accounts.findUnique({
        where: { customerId: customerId},
        select: { customerId: true, balance: true },
    });

    if (!account) {
        throw new Error("Account not found");
    }

    return account;
};

// How many XAF one Yousra coin is worth.
// Falls back to 25 if the env variable is missing or not a valid number.
const getExchangeRate = (): number => {
    const rate = Number(process.env.YOUSRA_COINS_EXCHANGE_RATE);

    if (Number.isFinite(rate) && rate > 0) {
        return rate;
    }

    return 25;
};

// Round a number to 2 decimal places
const roundToTwoDecimals = (value: number): number => {
    return Math.round(value * 100) / 100;
};

// Money (XAF) -> Yousra coins
export const convertToYousraCoins = (amount: number): number => {
    return roundToTwoDecimals(amount / getExchangeRate());
};

// Yousra coins -> money (XAF)
export const convertToCurrency = (yousraCoins: number): number => {
    return roundToTwoDecimals(yousraCoins * getExchangeRate());
};