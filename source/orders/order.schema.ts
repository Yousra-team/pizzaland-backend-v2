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
    addonId:          z.string().optional(),
    quantity:         z.number().int().min(1),
    type:             z.enum(itemTypeEnum),
});

// ── Base fields shared by all order types ──
// cashierEmail / employeeEmail are NOT here: the server takes them from the token.
// customerPhone: ignored for customers (taken from the token); for staff it is the
// customer's phone, or left out for a walk-in customer (pickup / dine-in only).
const baseOrder = {
    customerPhone: z.e164().optional(),
    items:         z.array(orderItemSchema).min(1),
};

// ── Discriminated union: one parse validates everything ──
export const createOrderSchema = z.discriminatedUnion("orderType", [
    z.object({
        ...baseOrder,
        orderType: z.literal("pickup"),
        pickupTime: z.coerce.date(),
        branchId: z.string().optional(), // required for customers: the branch they pick up from
    }),
    z.object({
        ...baseOrder,
        orderType: z.literal("dineIn"),
        table: z.string(),
        branchId: z.string().optional(), // required for customers: the branch they dine in
    }),
    z.object({
        ...baseOrder,
        orderType: z.literal("delivery"),
        // branch, delivery fee and estimated delivery time all come from the shipping address
        shippingAddressName:   z.string(),
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
    discount:      z.number().min(0).optional(), // max (the subtotal) is checked in updateOrder
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