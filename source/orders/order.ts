import {prisma} from "../lib/prisma";
import {Request, Response} from "express";
import * as z from "zod";

// Create a Helper function to generate Order Numbers



const orderSchema = z.object({
    number : z.string(),
    branchId: z.string(),
    cashierEmail: z.email().optional(),
    customerPhone: z.e164(),
    employeeEmail: z.email().optional(),
    discount: z.number(),
    subtotal: z.number(),
    status: z.enum(["pending" ,"confirmed" , "kitchen", "preparing", "ready" , "ready_for_delivery", "out_for_delivery" , "delivered" , "cancelled"]),
    total: z.number(),
});

const createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = orderSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error});
            return;
        }
        const validatedData = result.data;

       // const newOrder = await prisma.orders.create({
           // data: validatedData,
      //  });

       // res.status(201).json(newOrder);
    } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
};

const getAllOrders = async (req: Request, res: Response): Promise<void> => {}

const getOrderById = async (req: Request, res: Response): Promise<void> => {}

const updateOrder = async (req: Request, res: Response): Promise<void> => {}

export {
    createOrder,
    getAllOrders,
    getOrderById,
    updateOrder
};