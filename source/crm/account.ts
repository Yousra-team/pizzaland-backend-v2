import { customerSchema , reviewSchema , favoriteSchema , accountSchema , userPreferenceSchema } from "./crm.schema";
import * as z from "zod";
//import { Request, Response } from "express";
import { prisma } from '../lib/prisma';

export const creditAccount = async (customerPhone: string, amount: number): Promise<void> => {
    const result = accountSchema.safeParse({ customerPhone, balance: amount, password: "dummy" });
    if (!result.success) {
        throw new Error(`Invalid input: ${result.error}`);
    };

    try {
        const account = await prisma.accounts.findUnique({
            where: { customerPhone }
        });
        if (!account) {
            throw new Error("Account not found");
        }
        await prisma.accounts.update({
            where: { customerPhone },
            data: { balance: { increment: amount } }
        });
    } catch (error) {
        throw new Error(`Failed to credit account: ${error}`);
    }
};

export const debitAccount = async (customerPhone: string, amount: number): Promise<void> => {
    const result = accountSchema.safeParse({ customerPhone, balance: amount, password: "dummy" });  
    if (!result.success) {
        throw new Error(`Invalid input: ${result.error}`);
    }
    try {
        const account = await prisma.accounts.findUnique({
            where: { customerPhone }
        });
        if (!account) {
            throw new Error("Account not found");
        }
        await prisma.accounts.update({
            where: { customerPhone },
            data: { balance: { decrement: amount } }
        });
    } catch (error) {
        throw new Error(`Failed to debit account: ${error}`);
    }
};

export const getAccountBalance = async (customerPhone: string): Promise<number> => {
    try {
        const account = await prisma.accounts.findUnique({
            where: { customerPhone }
        });
        if (!account) {
            throw new Error("Account not found");
        }
        return account.balance;
    } catch (error) {
        throw new Error(`Failed to get account balance: ${error}`);
    }
};

 export const convertToYousraCoins = async (amount: number) => {
    
    const exchangeRate = process.env.YOUSRA_COINS_EXCHANGE_RATE || 25; // Default exchange rate if not set

    const yousraCoins = amount / Number(exchangeRate);
    return yousraCoins;

 };

 export const convertToCurrency = async (yousraCoins: number) => {
    const exchangeRate = process.env.YOUSRA_COINS_EXCHANGE_RATE || 25; // Default exchange rate if not set
    const currency = yousraCoins * Number(exchangeRate);
    return currency;
 };
