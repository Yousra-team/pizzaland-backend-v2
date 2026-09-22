import * as z from "zod";

export const branchSchema = z.object({
 name : z.string(),
 region: z.string(),
 city: z.string(),
 neighborhood: z.string(),
 managerEmail: z.email().optional(),
 
});

export const shippingAddressSchema = z.object({
    name: z.string(),
    region: z.string(),
    city: z.string(),
    neighborhood: z.string(),
    deliveryFee: z.number(),
    deliveryTime: z.number(),
    branchId: z.string(),
}); 
