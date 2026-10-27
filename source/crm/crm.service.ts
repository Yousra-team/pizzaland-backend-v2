import { reviewSchema , favoriteSchema , userPreferenceSchema, AddresSchema, creditSchema, sendYousraCoinsSchema, updateProfileSchema } from "./crm.schema.js";
import * as z from "zod";
import { Request, Response } from "express";
import { prisma } from '../lib/prisma.js';
import { convertToCurrency, convertToYousraCoins, creditAccount, debitAccount, getAccountBalance } from "./account.js";

// All handlers below run after authMiddleware, so req.user is set.
// For customers, req.user.Id is their `customerId` (cuid). Phone is kept as a
// @unique column on Customers and used only for human-facing lookup (e.g.
// resolving a receiver when sending Yousra Points by phone number).

// CREATE SECTION

// Add a favorite product for the logged-in customer
export const addFavorite = async (req: Request, res: Response): Promise<void> => {
    const customerId = req.user.Id;
    const result = favoriteSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: { message: "Invalid favorite data", details: z.flattenError(result.error).fieldErrors } });
        return;
    }

    try {
        // @@unique([customerId, productId]): upsert returns the existing favorite
        // instead of failing when the customer favorites the same product twice
        const favorite = await prisma.favorites.upsert({
            where: { customerId_productId: { customerId, productId: result.data.productId } },
            update: {},
            create: { ...result.data, customerId }
        });
        res.status(200).json({ data: favorite });
    } catch (error: any) {
        console.error("addFavorite failed:", error);
        if (error.code === "P2003") {
            res.status(404).json({ error: { message: "Product not found", code: "NOT_FOUND" } });
            return;
        }
        res.status(500).json({ error: { message: "Failed to add favorite product" } });
    }
};

// Add a review for a product by the logged-in customer
export const addReview = async (req: Request, res: Response): Promise<void> => {
    const customerId = req.user.Id;
    const result = reviewSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: { message: "Invalid review data", details: z.flattenError(result.error).fieldErrors } });
        return;
    }

    try {
        const review = await prisma.reviews.create({
            data: { ...result.data, customerId }
        });
        res.status(201).json({ data: review });
    } catch (error: any) {
        console.error("addReview failed:", error);
        if (error.code === "P2003") {
            res.status(404).json({ error: { message: "Product not found", code: "NOT_FOUND" } });
            return;
        }
        res.status(500).json({ error: { message: "Failed to add review" } });
    }
};

// Set a preference for the logged-in user (customer or employee).
// Each user has at most one value per preference name, so an existing one is updated.
export const addUserPreference = async (req: Request, res: Response): Promise<void> => {
    const result = userPreferenceSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: { message: "Invalid preference data", details: z.flattenError(result.error).fieldErrors } });
        return;
    }

    const owner = req.user.role === "CUSTOMER"
        ? { customerId: req.user.Id }
        : { employeeEmail: req.user.Id };

    try {
        const existing = await prisma.userPreferences.findFirst({
            where: { ...owner, name: result.data.name }
        });

        if (existing) {
            const userPreference = await prisma.userPreferences.update({
                where: { id: existing.id },
                data: { value: result.data.value }
            });
            res.status(200).json({ data: userPreference });
            return;
        }

        const userPreference = await prisma.userPreferences.create({
            data: { ...result.data, ...owner }
        });
        res.status(201).json({ data: userPreference });
    } catch (error) {
        console.error("addUserPreference failed:", error);
        res.status(500).json({ error: { message: "Failed to save user preference" } });
    }
};

export const createAddress = async (req: Request, res: Response): Promise<void> => {
    const customerId = req.user.Id;

    if (!customerId) {
        res.status(401).json({ message: "You are not logged In" });
        return;
    }

    try {
        const result = AddresSchema.safeParse(req.body);
        if (!result.success) {
            const formattedErrors = z.flattenError(result.error);
            res.status(403).json({ message: "Oh Oh there's a typo", error: formattedErrors.fieldErrors });
            return;
        }

        const addressData = result.data;

        const address = await prisma.address.create({
            data: {
                customerId,
                ...addressData,
            },
        });
        res.status(200).json(address);

    } catch (error) {
        console.log("Error Creating an address:", error);
        res.status(500).json({ message: "Sorry An internal error has occurred" });
    }
};

// GET SECTION

// Get all reviews for a specific product (public)
export const getReviewsByProductId = async (req: Request, res: Response): Promise<void> => {
    const productId = req.params.productId as string;
    try {
        const reviews = await prisma.reviews.findMany({
            where: { productId },
            // only the reviewer's name: this route is public, so no phone/email/date of birth
            include: { customer: { select: { firstName: true, lastName: true } } },
            orderBy: { createdAt: "desc" }
        });
        res.status(200).json({ data: reviews });
    } catch (error) {
        console.error("getReviewsByProductId failed:", error);
        res.status(500).json({ error: { message: "Failed to fetch reviews" } });
    }
};

// Get all reviews written by the logged-in customer
export const getReviewsByCustomerId = async (req: Request, res: Response): Promise<void> => {
    const customerId = req.user.Id;
    try {
        const reviews = await prisma.reviews.findMany({
            where: { customerId },
            orderBy: { createdAt: "desc" }
        });
        res.status(200).json({ data: reviews });
    } catch (error) {
        console.error("getReviewsByCustomerId failed:", error);
        res.status(500).json({ error: { message: "Failed to fetch reviews" } });
    }
};

// Get all favorites of the logged-in customer
export const getFavoritesByCustomerId = async (req: Request, res: Response): Promise<void> => {
    const customerId = req.user.Id;
    try {
        const favorites = await prisma.favorites.findMany({
            where: { customerId },
            include: { product: true }
        });
        res.status(200).json({ data: favorites });
    } catch (error) {
        console.error("getFavoritesByCustomerId failed:", error);
        res.status(500).json({ error: { message: "Failed to fetch favorites" } });
    }
};

// Get all preferences of the logged-in user (customer or employee)
export const getUserPreferences = async (req: Request, res: Response): Promise<void> => {
    const owner = req.user.role === "CUSTOMER"
        ? { customerId: req.user.Id }
        : { employeeEmail: req.user.Id };
    try {
        const userPreferences = await prisma.userPreferences.findMany({
            where: owner
        });
        res.status(200).json({ data: userPreferences });
    } catch (error) {
        console.error("getUserPreferences failed:", error);
        res.status(500).json({ error: { message: "Failed to fetch user preferences" } });
    }
};

export const getCustomerAddress = async (req: Request, res: Response): Promise<void> => {
    const customerId = req.user.Id;

    if (!customerId) {
        res.status(401).json({ message: "You are not logged In" });
        return;
    }

    try {
        const addresses = await prisma.address.findMany({
            where: { customerId },
        });
        res.status(200).json({ data: addresses });
    } catch (error) {
        console.log("Error on our side:", error);
        res.status(500).json({ message: "Internal error" });
    }
};

// Get customers
export const getCustomers = async (req: Request, res: Response): Promise<void> => {
    try {
        const customers = await prisma.customers.findMany();
        res.status(200).json({ message: "Customer found successfully", customers });
    } catch (error) {
        console.log("Getting customer failed", error);
        res.status(500).json({ message: "Failed to find customers" });
    }
};

// DELETE ENDPOINTS

export const deleteAddress = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;

    try {
        const address = await prisma.address.delete({
            where: { id }
        });

        res.status(200).json({ message: "Address Deleted", address });
    } catch (error) {
        console.log("Deleting address failed", error);
        res.status(500).json({ message: "Failed to delete address" });
    }
};

export const myBalance = async (req: Request, res: Response): Promise<void> => {
    try {
        const customerId = req.user.Id as string;

        if (!customerId) {
            res.status(401).json({ message: "You are not logged In" });
            return;
        }

        const customer = await prisma.customers.findUnique({
            where: { customerId },
            include: { accounts: true }
        });

        if (!customer) {
            res.status(404).json({ message: "Customer does not exist or does not have an account" });
            return;
        }

        const YousraCoins = customer.accounts?.balance;

        if (YousraCoins === undefined || YousraCoins === null) {
           res.status(400).json({ message: "There is no account or account balance found" });
           return;
         }

        const balanceInXAF = convertToCurrency(YousraCoins);

        res.status(200).json({ XAF: balanceInXAF, Yousra: YousraCoins });

    } catch (error) {
        res.status(500).json({ message: "An internal server error" });
        console.log(error);
    }
};

export const myProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const customerId = req.user.Id as string;

        if (!customerId) {
            res.status(401).json({ message: "You are not authenticated" });
            return;
        }

        const profile = await prisma.customers.findUnique({
            where: { customerId },
            include: { accounts: true }
        });

        if (!profile) {
            res.status(404).json({ message: "Could not find this profile" });
            return;
        }

        res.status(200).json(profile);
    } catch (error) {
        res.status(500).json({ message: "An internal error occurred" });
        console.log(error);
    }
};

// Send Yousra Points from the logged-in customer to another customer (identified by phone).
// Records the movement in PointsTransaction so the full ledger is preserved.
export const sendYousraCoins = async (req: Request, res: Response): Promise<void> => {
    try {
        const senderCustomerId = req.user?.Id;
        if (!senderCustomerId) {
            res.status(401).json({ error: { message: "The sender is not logged in" } });
            return;
        }

        const result = sendYousraCoinsSchema.safeParse(req.body);
        if (!result.success) {
            const fieldErrors = z.flattenError(result.error);
            res.status(400).json({
                error: { message: "Invalid schema", fields: fieldErrors.fieldErrors }
            });
            return;
        }

        const receiverPhone = result.data.customerPhone;
        let amount = result.data.amount;
        const format = result.data.format;

        if (format === "xaf") {
            amount = convertToYousraCoins(amount);
        }

        if (amount <= 0) {
            res.status(400).json({ error: { message: "Amount must be greater than zero" } });
            return;
        }

        // Resolve the receiver by phone → customerId (phone is still @unique on Customers)
        const receiver = await prisma.customers.findUnique({
            where: { phone: receiverPhone },
            select: { customerId: true }
        });

        if (!receiver) {
            res.status(404).json({ error: { message: "Receiver not found" } });
            return;
        }

        const receiverCustomerId = receiver.customerId;

        if (senderCustomerId === receiverCustomerId) {
            res.status(400).json({ error: { message: "You cannot send coins to yourself" } });
            return;
        }

        await prisma.$transaction(async (tx) => {
            await debitAccount(senderCustomerId, amount, tx);
            await creditAccount(receiverCustomerId, amount, tx);
            await tx.pointsTransaction.create({
                data: {
                    amount,
                    fromCustomerId: senderCustomerId,
                    toCustomerId: receiverCustomerId,
                }
            });
        });

        res.status(200).json({
            data: {
                message: "Transfer successful",
                amount,
                to: receiverPhone
            }
        });

    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "Insufficient balance") {
                res.status(400).json({ error: { message: "Insufficient balance" } });
                return;
            }
            if (error.message === "Account not found") {
                res.status(404).json({ error: { message: "Account not found" } });
                return;
            }
        }
        console.error("sendYousraCoins error:", error);
        res.status(500).json({ error: { message: "Internal server error" } });
    }
};

export const updateMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = updateProfileSchema.safeParse(req.body);
        const customerId = req.user?.Id;

        if (!customerId) {
            res.status(401).json({ message: "You need to login" });
            return;
        }

        if (!result.success) {
            const fieldErrors = z.flattenError(result.error);
            res.status(400).json({ message: "An error occurred in updating my profile", error: fieldErrors.fieldErrors });
            return;
        }

        const newData = result.data;

        const updatedProfile = await prisma.customers.update({
            where: { customerId },
            data: newData
        });

        res.status(200).json({ message: "Successfully Updated", data: updatedProfile });

    } catch (error) {
        res.status(500).json({ message: "Internal error occurred" });
        console.log(error);
    }
};

export const OpenMyAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        const customerId = req.user.Id;

        if (!customerId) {
            res.status(401).json({ message: "You need to log in and or provide a token" });
            return;
        }

        const existingCustomer = await prisma.customers.findUnique({
            where: { customerId },
            include: { accounts: true },
        });

        if (!existingCustomer) {
            res.status(404).json({ message: "There is no user account for this number very sadly" });
            return;
        }

        if (existingCustomer.accounts) {
            res.status(400).json({ message: "You already have an account" });
            return;
        }

        const account = await prisma.accounts.create({
            data: {
                customerId,
                balance: 20,
            }
        });

        res.status(200).json({ message: "Account created", account });

    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
        console.log(error);
    }
};