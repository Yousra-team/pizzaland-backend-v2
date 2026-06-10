import {prisma} from "../lib/prisma";
import {Request, Response} from "express";

interface category {
    name : string; 
    description : string;
    imageUrl : string;
    imagePublicId : string;
}

const createCategory = async (req: Request, res: Response): Promise<void> => {
    try {
         
        const { name , description, imageUrl, imagePublicId } : category = req.body;

        const category = await prisma.category.create({
            data: {
                name,
                description,
                imageUrl: imageUrl,
                imagePublicId: imagePublicId
            }
        });

        res.status(201).json(category);
    } catch (error) {
        res.status(500).json({ error: "Failed to create category" });
        console.error("Error creating category:", error);
        console.log("Request body:", req.body);
    }
};



const getCategory = async (req: Request, res: Response): Promise<void> => {
    try {} catch (error) {} 
};

const updateCategory = async (req: Request, res: Response): Promise<void> => {
    try {} catch (error) {}
};

export { createCategory, getCategory, updateCategory };