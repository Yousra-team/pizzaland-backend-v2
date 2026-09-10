import {prisma} from "../lib/prisma";
import {Request, Response} from "express";
import {orderSchema , deliverySchema , dineIn ,pickUpSchema , orderStatusQuerySchema } from "./order.schema";
import * as z from "zod";

export const createOrder = async (req: Request, res: Response): Promise<void> => {
    const result = orderSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            error: {
                message: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: result.error.issues.map((issue) => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                })),
            },
        });
        return;
    }

    const {
        number, branchId, cashierEmail, customerPhone,
        employeeEmail, discount, subtotal, total, orderType, status,
    } = result.data;
    const { items } = result.data;

    // Validate the type-specific payload BEFORE opening a transaction,
    // so a bad delivery/dineIn/pickup body never triggers a DB write.
    let deliveryData: z.infer<typeof deliverySchema> | undefined;
    let dineInData: z.infer<typeof dineIn> | undefined;
    let pickupData: z.infer<typeof pickUpSchema> | undefined;

    if (orderType === 'delivery') {
        const delivery = deliverySchema.safeParse(req.body.delivery);
        if (!delivery.success) {
            res.status(400).json({
                error: { message: 'Invalid delivery payload', code: 'VALIDATION_ERROR' },
            });
            return;
        }
        deliveryData = delivery.data;
    } else if (orderType === 'dineIn') {
        const dine = dineIn.safeParse(req.body.dineIn);
        if (!dine.success) {
            res.status(400).json({
                error: { message: 'Invalid dine-in payload', code: 'VALIDATION_ERROR' },
            });
            return;
        }
        dineInData = dine.data;
    } else if (orderType === 'pickup') {
        const pickup = pickUpSchema.safeParse(req.body.pickup);
        if (!pickup.success) {
            res.status(400).json({
                error: { message: 'Invalid pickup payload', code: 'VALIDATION_ERROR' },
            });
            return;
        }
        pickupData = pickup.data;
    } else {
        res.status(400).json({
            error: { message: 'Invalid order type', code: 'INVALID_ORDER_TYPE' },
        });
        return;
    }

    try {
        const order = await prisma.$transaction(async (tx) => {
            const newOrder = await tx.orders.create({
                data: {
                    number,
                    branchId,
                    cashierEmail,
                    customerPhone,
                    employeeEmail,
                    discount,
                    subtotal,
                    total,
                    orderType,
                    status,
                },
            });

            await tx.orderItems.createMany({
                data: items.map((item) => ({
                    ...item,
                    orderNumber: newOrder.number,
                })),
            });

            if (orderType === 'delivery' && deliveryData) {
                const { driverEmail, status: deliveryStatus, estimatedDeliveryTime, actualDeliveryTime, shippingAddressName } = deliveryData;
                await tx.deliveries.create({
                    data: {
                        orderNumber: newOrder.number, // derived, never from client input
                        driverEmail,
                        status: deliveryStatus,
                        estimatedDeliveryTime,
                        actualDeliveryTime,
                        shippingAddressName,
                    },
                });
            } else if (orderType === 'dineIn' && dineInData) {
                const { table } = dineInData;
                await tx.dineInOrders.create({
                    data: {
                        orderNumber: newOrder.number,
                        table,
                    },
                });
            } else if (orderType === 'pickup' && pickupData) {
                await tx.pickupOrders.create({
                    data: {
                        orderNumber: newOrder.number,
                        ...pickupData,
                    },
                });
            }

            return newOrder;
        });

        res.status(201).json({ data: order });
    } catch (err) {
        // Let your centralized error handler / next(err) take over,
        // or inline a 500 here if you don't have one wired up yet.
        console.error('createOrder transaction failed:', err);
        res.status(500).json({
            error: { message: 'Failed to create order', code: 'ORDER_CREATE_FAILED' },
        });
    }
};
// Below are the routes to get all orders
const orderListInclude = {
    items: {
        include: {
            product: true,
            productVariant: true,
            menu: true,
            addons: true,
        },
    },
    delivery: true,
    dineInOrder: true,
    pickupOrder: true,
} as const;

export const getOrdersByStatus = async (req: Request, res: Response): Promise<void> => {
    // req.query already validated + parsed by validateQuery(orderStatusQuerySchema)
    const { status } = req.query as z.infer<typeof orderStatusQuerySchema>;

    const orders = await prisma.orders.findMany({
        where: status ? { status } : undefined, // no status query param -> return all
        orderBy: { createdAt: 'desc' },
        include: orderListInclude,
    });

    res.status(200).json({ data: orders });
};

export const getActiveOrders = async (req: Request, res: Response): Promise<void> => {
    const orders = await prisma.orders.findMany({
        where: {
            status: { notIn: ['cancelled', 'successful'] },
        },
        orderBy: { createdAt: 'desc' },
        include: orderListInclude,
    });

    res.status(200).json({ data: orders });
};

// code to add an order