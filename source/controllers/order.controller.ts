import {prisma} from "../lib/prisma";
import {Request, Response} from "express";


const createOrder = async (req: Request, res: Response): Promise<void> => {
    try {

        
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