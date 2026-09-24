import * as z from "zod";

export const ProductSchema = z.object({
    name: z.string(),
    description: z.string(),
    categoryId: z.string(),
    subCategoryId: z.string().optional(),
    stationId : z.string().optional(),
    price : z.coerce.number().positive(),
    popularity: z.coerce.number().int().optional(),
    preparationTime : z.coerce.number().int().optional(),
});

export const AddonSchema = z.object({
   id: z.string().optional(),
   name : z.string(),
   description : z.string(),
   price : z.coerce.number(),
});

export const ProductVariantSchema = z.object({
    name : z.string(),
    price : z.number(),
});

export const CategorySchema = z.object({
    name : z.string(),
    description : z.string(),
});

export const SubCategorySchema = z.object({
    name : z.string(),
    description : z.string(),
    categoryId: z.string(),
});

export const ManyProductSchema = z.array(
    z.object({
    name: z.string(),
    description: z.string(),
    categoryId: z.string(),
    subCategoryId: z.string().optional(),
    stationId : z.string().optional(),
    price : z.coerce.number().positive(),
    popularity: z.coerce.number().int().optional(),
    preparationTime : z.coerce.number().optional(),
    addons : z.array(
        z.object({
             id: z.string().optional(),
            name : z.string(),
            description : z.string(),
            price : z.coerce.number(),
        })
    ).optional(),
    variants: z.array(
        z.object({
         name : z.string(),
         price : z.coerce.number(),   
        })
    ).optional(),
    })
)

// MENUS
export const MenuSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.coerce.number().positive(),
  categoryId: z.string(),
  subCategoryId: z.string(),      // was "subcategoryId" — Prisma model uses capital C   // was missing entirely — required on the model
  preparationTime: z.coerce.number().int().optional(), // Prisma has it as Int? (optional)
  MenuItems: z.array(z.object({
    productId: z.string(),
    quantity: z.coerce.number(),
  }))
});
// A menu needs an Addons*