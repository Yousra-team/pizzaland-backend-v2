import { accountMovementSchema } from "./crm.schema.js";
import { prisma } from '../lib/prisma.js';
import { Prisma } from "../generated/prisma/client.js";

// These helpers are called from other services (orders, payments), not directly by routes.
// They throw on failure; the calling controller turns the error into an HTTP response.
//
// Money uses Prisma.Decimal (exact base-10 math) instead of number (binary floating point,
// where 0.1 + 0.2 = 0.30000000000000004). The balance column is DECIMAL(14, 2).

export const creditAccount = async (customerPhone: string, amount: number): Promise<void> => {
    const result = accountMovementSchema.safeParse({ customerPhone, amount });
    if (!result.success) {
        throw new Error(`Invalid input: ${result.error.message}`);
    }

    try {
        await prisma.accounts.update({
            where: { customerPhone },
            data: { balance: { increment: new Prisma.Decimal(amount) } }
        });
    } catch (error: any) {
        if (error.code === "P2025") {
            throw new Error("Account not found");
        }
        throw error;
    }
};

export const debitAccount = async (customerPhone: string, amount: number): Promise<void> => {
    const result = accountMovementSchema.safeParse({ customerPhone, amount });
    if (!result.success) {
        throw new Error(`Invalid input: ${result.error.message}`);
    }
    const decimalAmount = new Prisma.Decimal(amount);

    // Check and decrement in ONE query: only updates if the balance is high enough.
    // Two separate queries (read, then update) would let two parallel debits both pass the check.
    const updated = await prisma.accounts.updateMany({
        where: { customerPhone, balance: { gte: decimalAmount } },
        data: { balance: { decrement: decimalAmount } }
    });

    if (updated.count === 0) {
        const account = await prisma.accounts.findUnique({ where: { customerPhone } });
        throw new Error(account ? "Insufficient balance" : "Account not found");
    }
};

// Returns a Decimal: use .toString() to send it in JSON without losing precision
export const getAccountBalance = async (customerPhone: string): Promise<Prisma.Decimal> => {
    const account = await prisma.accounts.findUnique({
        where: { customerPhone }
    });
    if (!account) {
        throw new Error("Account not found");
    }
    return account.balance;
};

// How many XAF one Yousra coin is worth. Falls back to 25 if the env var is missing or not a number.
const getExchangeRate = (): Prisma.Decimal => {
    const rate = Number(process.env.YOUSRA_COINS_EXCHANGE_RATE);
    return new Prisma.Decimal(Number.isFinite(rate) && rate > 0 ? rate : 25);
};

// Both results are rounded to 2 decimals, the same precision as the balance column
export const convertToYousraCoins = (amount: number | Prisma.Decimal): Prisma.Decimal => {
    return new Prisma.Decimal(amount).div(getExchangeRate()).toDecimalPlaces(2);
};

export const convertToCurrency = (yousraCoins: number | Prisma.Decimal): Prisma.Decimal => {
    return new Prisma.Decimal(yousraCoins).mul(getExchangeRate()).toDecimalPlaces(2);
};
