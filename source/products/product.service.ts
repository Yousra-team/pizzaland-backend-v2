import { ProductSchema, AddonSchema ,ProductVariantSchema } from './product.schema';
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

export const createProduct = async (req: Request, res: Response) => {
    const result = ProductSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid product data', details: result.error } });
    }

    const productData = result.data;

    // addons are optional — some reference existing addons (by id), others are created inline
    type AddonInput = z.infer<typeof AddonSchema>; // "one item from the addons array"

    let existingAddonIds: string[] = [];
    let newAddonsData: AddonInput[] = [];



    if (req.body.addons) {
        const addonsResult = z.array(AddonSchema).safeParse(req.body.addons);

        if (!addonsResult.success) {
            return res.status(400).json({ error: { message: 'Invalid addon data', details: addonsResult.error } });
        }

        existingAddonIds = addonsResult.data
            .filter((addon) => addon.id)
            .map((addon) => addon.id as string);

        newAddonsData = addonsResult.data
            .filter((addon) => !addon.id);
    }
      // Variants
      const VariantResult = z.array(ProductVariantSchema).safeParse(req.body.variants);

      if (!VariantResult.success) {
          return res.status(400).json({ error: { message: 'Invalid variant data', details: VariantResult.error } });
      }

    try {
        const newProduct = await prisma.products.create({
            data: {
                ...productData,
                addons: {
                    connect: existingAddonIds.map((id) => ({ id })),
                    create: newAddonsData,
                },
                variants: {
                    create: VariantResult.data,
                },
            },
            include: { addons: true, variants: true },
        });

        res.status(201).json({ data: newProduct, meta: null });
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ error: { message: "Failed to create product" } });
    }
};

// Function to Fetch All Products
export const getAllProducts = async (req: Request, res: Response) =>  {
      
  try {
      const products = await prisma.products.findMany({
          include: { addons: true, variants: true },
      });
      res.status(200).json({ data: products, meta: null });
  } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: { message: "Failed to fetch products" } });
  }
 
};

// Function to Fetch a Product by ID
export const getProductById = async (req: Request, res: Response) => {
    const id = req.params.id as string;

    try {
        const product = await prisma.products.findUnique({
            where: { id },
            include: { addons: true, variants: true },
        });

        if (!product) {
            return res.status(404).json({ error: { message: "Product not found" } });
        }

        res.status(200).json({ data: product, meta: null });
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ error: { message: "Failed to fetch product" } });
    }
};

// Update Product by ID
export const updateProductById = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = ProductSchema.partial().safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid product data', details: result.error } });
    }

    try {
        const updatedProduct = await prisma.products.update({
            where: { id },
            data: result.data,
            include: { addons: true, variants: true },
        });

        res.status(200).json({ data: updatedProduct, meta: null });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ error: { message: "Failed to update product" } });
    }
};