import * as z from "zod";

// Enums
const statusEnum = ["pending", "kitchen", "confirmed", "ready", "preparing" ,"out_for_delivery", "ready_for_delivery", "delivered" ,"successful", "cancelled"] as const;
const orderType = ["delivery", "pickup" ,"dineIn" , "takeOut"] as const;
const itemStatus = ["pending" ,"preparing" , "in_station", "out_of_station" , "ready" , "complete"] as const;
const itemType = ["addons" , "menu" , "product"] as const;
const deliveryStatus = ["pending" , "in_transit" , "delivered" , "assigned", "failed"] as const;
// Schemas
export const orderSchema = z.object({
    number: z.string(),
    branchId: z.string(),
    cashierEmail: z.email().optional(),
    customerPhone: z.e164(),
    employeeEmail: z.email().optional(),
    discount: z.number(),
    subtotal: z.number(),
    total: z.number(),
    status: z.enum(statusEnum),
    orderType: z.enum(orderType),
    items: z.array(
        z.object({
            productId: z.string().optional(),
            menuId: z.string().optional(),
            price: z.number(),
            quantity: z.number(),
            orderNumber: z.string(),
            estimatedReadyAt: z.date(),
            status: z.enum(itemStatus),
            type: z.enum(itemType),
        })
    ),
});

export const pickUpSchema = z.object({
    orderNumber : z.string(),
    pickupTime  : z.date(),
});

export const dineIn = z.object({
    orderNumber : z.string(),
    table : z.string(),
});

export const deliverySchema = z.object({
    orderNumber : z.string(),
    driverEmail : z.email(),
    status : z.enum(deliveryStatus),
    estimatedDeliveryTime : z.date(), // Had to remove optional here since it threw an error
    actualDeliveryTime : z.date().optional(),
    shippingAddressName : z.string(),

});

