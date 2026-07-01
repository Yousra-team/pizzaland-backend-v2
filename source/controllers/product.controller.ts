import {prisma} from "../lib/prisma";
import {Request, Response} from "express";
import uploadImage from "../utilities/uploadImage";

interface Product {
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    categoryId: string;
    subcategoryId: string;
    popularity: number;
    preparation_time: number;

};

const createProduct = async (req: Request, res: Response): Promise<void> => {
    try {
         
        const { name, description, price, categoryId, subcategoryId, popularity, preparation_time } = req.body;
        const file = req.file;

        if (!file) {
            res.status(400).json({ message: "Image file is required" });
            return;
        }

        const data = await uploadImage(file);

        const imageUrl = data.fullPath;

      const product = await prisma.products.create({
        data: {
          name,
          description,
          price,
          imageUrl,
          categoryId,
          subcategoryId,
          popularity,
          preparation_time
        }
      });

      res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

const deleteProduct = async (req: Request, res: Response): Promise<void> => {
    try {} catch (error) {}
};

const getProduct = async (req: Request, res: Response): Promise<void> => {
    try {} catch (error) {}
};

const updateProduct = async (req: Request, res: Response): Promise<void> => {
    try {} catch (error) {}
};

const addMenu = async (req: Request, res: Response): Promise<void> => {
    try {} catch (error) {}
};

const updateMenu = async (req: Request, res: Response): Promise<void> => {
    try {} catch (error) {}
};

const deleteMenu= async (req: Request, res: Response): Promise<void> => {
    try {} catch (error) {}
};

const getMenu = async (req: Request, res: Response): Promise<void> => {
    try {} catch (error) {}
};

export {
createProduct
};