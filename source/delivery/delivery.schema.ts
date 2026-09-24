import * as z from "zod";

// What a driver needs to see for a delivery: where to go, who to call,
// what to hand over and whether money must be collected.
export const driverDeliveryInclude = {
    shippingAddress: {
        select: {
            name: true, region: true, city: true, neighborhood: true,
            deliveryFee: true, deliveryTime: true,
        },
    },
    order: {
        select: {
            number: true,
            status: true,
            subtotal: true,
            discount: true,
            total: true,
            createdAt: true,
            customer: {
                select: { phone: true, firstName: true, lastName: true },
            },
            items: {
                select: {
                    quantity: true,
                    price: true,
                    product: { select: { name: true } },
                    menu:    { select: { name: true } },
                },
            },
            Payments: {
                select: { amount: true, method: true, status: true },
            },
        },
    },
} as const;

// A driver moves their delivery forward: in_transit (picked up), then delivered or failed
export const deliveryStatusSchema = z.object({
    status: z.enum(["in_transit", "delivered", "failed"]),
});
