import {prisma} from "../lib/prisma";
import {Request, Response} from "express";


const createOrder = async (req: Request, res: Response): Promise<void> => {}

const getAllOrders = async (req: Request, res: Response): Promise<void> => {}

const getOrderById = async (req: Request, res: Response): Promise<void> => {}

const updateOrder = async (req: Request, res: Response): Promise<void> => {}

export {
    createOrder,
    getAllOrders,
    getOrderById,
    updateOrder
};