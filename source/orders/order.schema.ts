import * as z from "zod";

// Enums
const orderTypeEnum = ["delivery", "pickup", "dineIn"] as const;
const itemTypeEnum  = ["addons", "menu", "product"] as const;
const deliveryStatusEnum = ["pending", "assigned", "in_transit", "delivered", "failed"] as const;

// ── Item schema (client only sends what to order) ──
const orderItemSchema = z.object({
    productId:        z.string().optional(),
    productVariantId: z.string().optional(),
    menuId:           z.string().optional(),
    quantity:         z.number().int().min(1),
    type:             z.enum(itemTypeEnum),
});

// ── Base fields shared by all order types ──
const baseOrder = {
    cashierEmail:  z.email().optional(),
    customerPhone: z.e164(),
    employeeEmail: z.email().optional(),
    items:         z.array(orderItemSchema).min(1),
};

// ── Discriminated union: one parse validates everything ──
export const createOrderSchema = z.discriminatedUnion("orderType", [
    z.object({
        ...baseOrder,
        orderType: z.literal("pickup"),
        pickupTime: z.coerce.date(),
    }),
    z.object({
        ...baseOrder,
        orderType: z.literal("dineIn"),
        table: z.string(),
    }),
    z.object({
        ...baseOrder,
        orderType: z.literal("delivery"),
        //driverEmail:           z.email(),
        shippingAddressName:   z.string(),
        estimatedDeliveryTime: z.coerce.date(),
    }),
]);

// ── For GET /orders?status=pending filtering ──
export const statusEnum = [
    "pending", "kitchen", "confirmed", "preparing", "ready",
    "ready_for_delivery", "out_for_delivery", "successful",
    "delivered", "cancelled",
] as const;

export const orderStatusQuerySchema = z.object({
    status: z.enum(statusEnum).optional(),
});

// In order.schema.ts

export const updateOrderSchema = z.object({
    // ── Base order fields ──
    status:        z.enum(statusEnum).optional(),
    discount:      z.number().optional(),
    employeeEmail: z.email().optional(),

    // ── Pickup update ──
    pickupTime: z.coerce.date().optional(),

    // ── Dine-in update ──
    table: z.string().optional(),

    // ── Delivery update ──
    driverEmail:           z.email().optional(),
    estimatedDeliveryTime: z.coerce.date().optional(),
    actualDeliveryTime:    z.coerce.date().optional(),
    deliveryStatus:        z.enum(deliveryStatusEnum).optional(),
});

// In order.schema.ts
export const deleteOrderSchema = z.object({
    numbers: z.array(z.string()).min(1),
});

// In order.schema.ts

const itemStatusEnum = ["pending", "preparing", "in_station", "out_of_station", "ready", "complete"] as const;

export const markItemStatusSchema = z.object({
    status: z.enum(itemStatusEnum),
});