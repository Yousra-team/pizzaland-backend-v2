import {prisma} from "../lib/prisma";
import {Request, Response} from "express";
import {orderSchema , ItemSchema} from "./order.schema";

export const createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
        // Schema validation with Zod
        const result = orderSchema.safeParse(req.body);
        const resultItems = ItemSchema.safeParse(req.body.items);

        if (!result.success) {
            res.status(400).json({ error: result.error});
            return;
        }

        if (!resultItems.success) {
            res.status(400).json({ error: resultItems.error });
            return;
        }

        const data = result.data;
        const validatedItemsData = resultItems.data;

        // We check if the order type and essential data on order type already exist
        if (data.orderType === "pickup" && !data.pickupTime) {
            res.status(400).json({ error: "pickupTime is required for pickup orders" });
            return;
        }
        if (data.orderType === "dineIn" && data.tableNumber === undefined) {
            res.status(400).json({ error: "tableNumber is required for dine-in orders" });
            return;
        }
        if (data.orderType === "delivery" && (!data.driverEmail || !data.shippingAddressName || !data.estimatedDeliveryTime)) {
            res.status(400).json({ error: "driverEmail, shippingAddressName and estimatedDeliveryTime are required for delivery orders" });
            return;
        }


        const order = await prisma.$transaction( async (tx) =>{

        });
        const newOrder = await prisma.orders.create({
            data: {
                number : validatedData.number,
                branchId: validatedData.branchId,
                cashierEmail: validatedData.cashierEmail,
                customerPhone: validatedData.customerPhone,
                employeeEmail: validatedData.employeeEmail,
                discount: validatedData.discount,
                total: validatedData.total,
                subtotal: validatedData.subtotal,
                orderType: validatedData.orderType,
            },
        });
        const orderItems = await prisma.orderItems.create({
            data: {
                orderNumber : validatedData.number,
                productId: validatedItemsData.items.productId,
                menuId: validatedItemsData.items.menuId,
                quantity: validatedItemsData.quantity,
                price: validatedItemsData.price,
                status: validatedItemsData.status,
                estimatedReadyAt: validatedItemsData.estimatedReadyAt
            }
        });

        if (newOrder)


        res.status(201).json(newOrder);
    } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
};

const getAllOrders = async (req: Request, res: Response): Promise<void> => {
    try {

    } catch




};

const getOrderById = async (req: Request, res: Response): Promise<void> => {}


export const updateOrder = async (req: Request, res: Response): Promise<void> => {
    try {
        const params = updateOrderSchema.safeParse(req.params);
        if (!params.success) {
            res.status(400).json({ error: params.error });
            return;
        }
        const {number} = params.data;

        const result = updateOrderSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error });
            return;
        }

        const validatedData = result.data;

        const existingOrder = await prisma.orders.findUnique({
            where: { number },
        });

        if (!existingOrder) {
            res.status(404).json({ error: "Order not found" });
            return;
        }

        if (Object.keys(validatedData).length === 0) {
            res.status(400).json({ error: "No fields provided to update" });
            return;
        }

        const order = await prisma.orders.update({
            where: { number },
            data: validatedData,
        });

        res.status(200).json(order);
    } catch (error: any) {
        if (error.code === "P2025") {
            res.status(404).json({ error: "Order not found" });
            return;
        }

        console.error("Error updating order:", error);
        res.status(500).json({ error: "Failed to update order" });
    }
};
