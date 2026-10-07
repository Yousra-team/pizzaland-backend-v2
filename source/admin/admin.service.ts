import {Request , Response} from "express";
import {prisma} from "../lib/prisma.js"
import { fullOrderInclude } from "../orders/order.include.js";

export const getAllEmployees = async (req: Request , res: Response) => {
    try{
         const employees = await prisma.employees.findMany()
         res.status(200).json(employees);
    }catch(error){
     res.status(500).json({message:"Internal server error"})
     console.log(error)
    }
};

export const getAllProducts = async (req: Request , res: Response) => {
    try {
        const products = await prisma.products.findMany()
        res.status(200).json(products)
    } catch (error) {
       res.status(500).json({message:"An error occurred when finding products"})
       console.log(error)
    }
};

export const getAllAddons = async (req: Request , res: Response) => {
    try {
        const addons = await prisma.addons.findMany()
        res.status(200).json(addons)
    } catch (error) {
       res.status(500).json({message:"An error occurred when finding addons"})
       console.log(error)
    }
};

export const getAllMenus = async (req: Request , res: Response) => {
    try {
        const menu = await prisma.menu.findMany({
            include: {items: true}
        })
        res.status(200).json(menu)
    } catch (error) {
       res.status(500).json({message:"An error occurred when finding addons"})
       console.log(error)
    }
};

export const getAllCategories = async (req: Request , res: Response) => {
    try {
        const category = await prisma.category.findMany()
        res.status(200).json(category)
    } catch (error) {
       res.status(500).json({message:"An error occurred when finding categories"})
       console.log(error)
    }
};

export const getAllsubcategories = async (req: Request , res: Response) => {
    try {
        const menu = await prisma.subCategory.findMany()
        res.status(200).json(menu)
    } catch (error) {
       res.status(500).json({message:"An error occurred when finding subcategories"})
       console.log(error)
    }
};

export const getAllOrders = async (req: Request, res: Response) => {
    try {
        const order = await prisma.orders.findMany({
            include: fullOrderInclude
        })
        res.status(200).json({message: "Here are the orders:", order})
    } catch (error) {
        res.status(500).json({message:"An error occurred when finding ORDERS"})
       console.log(error)
    }
};