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

export const CategorySchema = z.object({
    name : z.string(),
    description : z.string(),
    imageUrl : z.string().optional(),
    imagePublicId : z.string().optional(),
});

export const SubCategorySchema = z.object({
    name : z.string(),
    description : z.string(),
    imageUrl : z.string().optional(),
    imagePublicId : z.string().optional(),
    categoryId: z.string(),
});

export const ManyProductSchema = z.array(
    z.object({
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
    addons : z.array(
        z.object({
             id: z.string().optional(),
            name : z.string(),
            description : z.string(),
            price : z.number(),
        })
    ).optional(),
    variants: z.array(
        z.object({
         name : z.string(),
         price : z.number(),   
        })
    ).optional(),
    })
)

// MENUS
export const MenuSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.number(),
  categoryId: z.string(),
  subCategoryId: z.string(),      // was "subcategoryId" — Prisma model uses capital C
  imageUrl: z.string(),
  imagePublicId: z.string(),      // was missing entirely — required on the model
  preparationTime: z.number().optional(), // Prisma has it as Int? (optional)
  MenuItems: z.array(z.object({
    productId: z.string(),
    quantity: z.number(),
  }))
});
// A menu needs an Addons*