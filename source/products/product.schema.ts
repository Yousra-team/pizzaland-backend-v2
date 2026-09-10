import * as z from "zod";

export const ProductSchema = z.object({
    name: z.string(),
    description: z.string(),
    categoryId: z.string(),
    subCategoryId: z.string().optional(),
    stationId : z.string().optional(),
    price : z.number(),
    imageUrl : z.string().optional(),
    imagePublicId : z.string().optional(),
    popularity: z.number().optional(),
    preparationTime : z.number().optional(),

});

export const AddonSchema = z.object({
    id: z.string().optional(),
   name : z.string(),
   description : z.string(),
   price : z.number(),
});

export const ProductVariantSchema = z.object({
    name : z.string(),
    price : z.number(),
});