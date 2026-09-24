import { accountMovementSchema } from "./crm.schema";
import { prisma } from '../lib/prisma';

// These helpers are called from other services (orders, payments), not directly by routes.
// They throw on failure; the calling controller turns the error into an HTTP response.

export const creditAccount = async (customerPhone: string, amount: number): Promise<void> => {
    const result = accountMovementSchema.safeParse({ customerPhone, amount });
    if (!result.success) {
        throw new Error(`Invalid input: ${result.error.message}`);
    }

    try {
        await prisma.accounts.update({
            where: { customerPhone },
            data: { balance: { increment: amount } }
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

    // Check and decrement in ONE query: only updates if the balance is high enough.
    // Two separate queries (read, then update) would let two parallel debits both pass the check.
    const updated = await prisma.accounts.updateMany({
        where: { customerPhone, balance: { gte: amount } },
        data: { balance: { decrement: amount } }
    });

    if (updated.count === 0) {
        const account = await prisma.accounts.findUnique({ where: { customerPhone } });
        throw new Error(account ? "Insufficient balance" : "Account not found");
    }
};

export const getAccountBalance = async (customerPhone: string): Promise<number> => {
    const account = await prisma.accounts.findUnique({
        where: { customerPhone }
    });
    if (!account) {
        throw new Error("Account not found");
    }
    return account.balance;
};

// How many XAF one Yousra coin is worth. Falls back to 25 if the env var is missing or not a number.
const getExchangeRate = (): number => {
    const rate = Number(process.env.YOUSRA_COINS_EXCHANGE_RATE);
    return Number.isFinite(rate) && rate > 0 ? rate : 25;
};

export const convertToYousraCoins = (amount: number): number => {
    return amount / getExchangeRate();
};

export const convertToCurrency = (yousraCoins: number): number => {
    return yousraCoins * getExchangeRate();
};
