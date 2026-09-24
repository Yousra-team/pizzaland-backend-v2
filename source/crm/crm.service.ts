import { reviewSchema , favoriteSchema , userPreferenceSchema } from "./crm.schema.js";
import * as z from "zod";
import { Request, Response } from "express";
import { prisma } from '../lib/prisma.js';

// All handlers below run after authMiddleware, so req.user is set.
// For customers, req.user.userId is their phone number (see authentication.ts).

// CREATE SECTION

// Add a favorite product for the logged-in customer
export const addFavorite = async (req: Request, res: Response): Promise<void> => {
    const customerPhone = req.user!.userId;
    const result = favoriteSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: { message: "Invalid favorite data", details: z.flattenError(result.error).fieldErrors } });
        return;
    }

    try {
        // @@unique([customerPhone, productId]): upsert returns the existing favorite
        // instead of failing when the customer favorites the same product twice
        const favorite = await prisma.favorites.upsert({
            where: { customerPhone_productId: { customerPhone, productId: result.data.productId } },
            update: {},
            create: { ...result.data, customerPhone }
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
    const customerPhone = req.user!.userId;
    const result = reviewSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: { message: "Invalid review data", details: z.flattenError(result.error).fieldErrors } });
        return;
    }

    try {
        const review = await prisma.reviews.create({
            data: { ...result.data, customerPhone }
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

    const owner = req.user!.role === "CUSTOMER"
        ? { customerPhone: req.user!.userId }
        : { employeeEmail: req.user!.userId };

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
export const getReviewsByCustomerPhone = async (req: Request, res: Response): Promise<void> => {
    const customerPhone = req.user!.userId;
    try {
        const reviews = await prisma.reviews.findMany({
            where: { customerPhone },
            orderBy: { createdAt: "desc" }
        });
        res.status(200).json({ data: reviews });
    } catch (error) {
        console.error("getReviewsByCustomerPhone failed:", error);
        res.status(500).json({ error: { message: "Failed to fetch reviews" } });
    }
};

// Get all favorites of the logged-in customer
export const getFavoritesByCustomerPhone = async (req: Request, res: Response): Promise<void> => {
    const customerPhone = req.user!.userId;
    try {
        const favorites = await prisma.favorites.findMany({
            where: { customerPhone },
            include: { product: true }
        });
        res.status(200).json({ data: favorites });
    } catch (error) {
        console.error("getFavoritesByCustomerPhone failed:", error);
        res.status(500).json({ error: { message: "Failed to fetch favorites" } });
    }
};

// Get all preferences of the logged-in user (customer or employee)
export const getUserPreferences = async (req: Request, res: Response): Promise<void> => {
    const owner = req.user!.role === "CUSTOMER"
        ? { customerPhone: req.user!.userId }
        : { employeeEmail: req.user!.userId };
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
