
// source/orders/order.include.ts
export const fullOrderInclude = {
    customer: {
        select: { phone: true, firstName: true, lastName: true },
    },
    items: {
        include: {
            product:        { select: { id: true, name: true, price: true } },
            productVariant: { select: { id: true, name: true, price: true } },
            menu:           { select: { id: true, name: true, price: true } },
            addons:         { select: { id: true, name: true, price: true } },
        },
    },
    pickupOrders: true,
    dineInOrders: {
        include: {
            table: {
                include: {
                    floor: { select: { id: true, name: true } },
                },
            },
        },
    },
    deliveries: {
        include: {
            shippingAddress: {
                select: { name: true, neighborhood: true, deliveryFee: true, deliveryTime: true },
            },
            driver: {
                select: { email: true, firstName: true, lastName: true, phone: true },
            },
        },
    },
    Payments: {
        select: { id: true, amount: true, method: true, status: true },
    },
    // NEW — the audit trail of status transitions, oldest first
    statusHistory: {
        orderBy: { createdAt: "asc" as const },
        include: {
            changedBy: {
                select: { email: true, firstName: true, lastName: true, role: true },
            },
        },
    },
} as const;