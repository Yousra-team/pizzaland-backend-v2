import { customerSchema , reviewSchema , favoriteSchema , accountSchema , userPreferenceSchema } from "./crm.schema";
import * as z from "zod";
import { Request, Response } from "express";
import { prisma } from '../lib/prisma';

// CREATE SECTION 

// Add a favorite product for a customer

export const addFavorite = async (req: Request, res: Response): Promise<void> => {
    const result = favoriteSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
    }

    try {
        const favorite = await prisma.favorites.create({
            data: result.data
        });
        res.status(201).json(favorite);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add favorite product' });
    }
}

// Add a review for a product by a customer

export const addReview = async (req: Request, res: Response): Promise<void> => {
    const result = reviewSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
    }

    try {
        const review = await prisma.reviews.create({
            data: result.data
        });
        res.status(201).json(review);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add review' });
    }
};

// Add a user preference for a customer

export const addUserPreference = async (req: Request, res: Response): Promise<void> => {
    const result = userPreferenceSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
    }

    try {
        const userPreference = await prisma.userPreferences.create({
            data: result.data
        });
        res.status(201).json(userPreference);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add user preference' });
    }
};

// GET SECTION

// Get all reviews for a specific product

export const getReviewsByProductId = async (req: Request, res: Response): Promise<void> => {
    const productId: string[] = req.body.productId;
    const created : object[] = [];
    try {
        for (const id of productId) {
           const reviews = await prisma.reviews.findMany({
            where: { productId: id },
            include: { customer: true }
        });
            created.push(reviews);
        }
       
        res.status(200).json(created);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
};

// Get all reviews by a specific customer
export const getReviewsByCustomerPhone = async (req: Request, res: Response): Promise<void> => {
    const customerPhone = req.user?.userId
    try {
         if(!customerPhone) {
            res.status(403).json({message: "Login First Bitch!"})
         };

         const reviews = prisma.reviews.findMany({
            where: {customerPhone}
         });
         res.status(200).json(reviews)

    }catch(error){
       res.status(500).json({ error: 'Failed to fetch reviews' }); 
    };
};


// Get all favorites for a specific customer
export const getFavoritesByCustomerPhone = async (req: Request, res: Response): Promise<void> => {
    const customerPhone = req.user?.userId
    try {
          if (!customerPhone) {
        res.status(403).json({message: "Login First Bitch!"})
     };

     const favorites = await prisma.favorites.findMany({
        where: {customerPhone},
        include: {product: true}
     });

     res.status(200).json(favorites)
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch favorites' });
    }
};

// Get all user preferences for a specific customer
export const getUserPreferences = async (req: Request, res: Response): Promise<void> => {
    try {
     const customerPhone = req.user?.userId;

     if (!customerPhone) {
        res.status(403).json({message: "Login First Bitch!"})
     };

     const userPreferences = await prisma.userPreferences.findMany({
        where: {customerPhone}
     });

     res.status(200).json(userPreferences)
    } catch(error) {
        res.status(500).json
    };
};
// Remember to JWT authmiddleware for all the above routes to ensure that only authenticated users can access them.
