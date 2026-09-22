// source/orders/order.includes.ts
export const fullOrderInclude = {
    customer: {
        select: { phone: true, firstName: true, lastName: true },
    },
    items: {
        include: {
            product: { select: { id: true, name: true, price: true } },
            menu:    { select: { id: true, name: true, price: true } },
        },
    },
    pickupOrders: true,
    dineInOrders: true,
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
} as const;