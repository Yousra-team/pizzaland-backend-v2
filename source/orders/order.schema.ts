import * as z from "zod";

// Enums
const orderTypeEnum = ["delivery", "pickup", "dineIn"] as const;
const itemTypeEnum  = ["addons", "menu", "product"] as const;

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
        driverEmail:           z.email(),
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