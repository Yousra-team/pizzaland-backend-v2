import * as z from "zod";

// Enums
const statusEnum = ["pending", "kitchen", "confirmed", "ready", "preparing" ,"out_for_delivery", "ready_for_delivery", "delivered" ,"successful", "cancelled"] as const;
const orderType = ["delivery", "pickup" ,"dineIn" , "takeOut"] as const;
const itemStatus = ["pending" ,"preparing" , "in_station", "out_of_station" , "ready" , "complete"] as const;
const itemType = ["addons" , "menu" , "product"] as const;

// Schemas
export const orderSchema = z.object({
    number: z.string(),
    branchId: z.string(),
    cashierEmail: z.string().optional(),
    customerPhone: z.e164().optional(),
    employeeEmail: z.email().optional(),
    discount: z.number(),
    subtotal: z.number(),
    total: z.number(),
    status: z.enum(statusEnum),
    orderType : z.enum(orderType),

});

export const ItemSchema = z.object({
        id : z.uuid(),
        productId : z.string().optional(),
        menuId : z.string().optional(),
        price : z.number(),
        quantity : z.number(),
        orderNumber : z.string(),
        estimatedReadyAt : z.date().optional(),
        status: z.enum(itemStatus),
        type: z.enum(itemType),
});

export const pickUpSchema = z.object({
    orderNumber : z.string(),
    pickupTime  : z.date(),
});

export const dineIn = z.object({
    id : z.string(),
    orderNumber : z.string(),
    tableNumber : z.number(),
});