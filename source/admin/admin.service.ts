import {Request , Response} from "express";
import {prisma} from "../lib/prisma.js"
import { fullOrderInclude } from "../orders/order.include.js";
import { updateEmployeeSchema } from "./admin.schema.js";
import * as z from "zod";
import { updateProfileSchema } from "../crm/crm.schema.js";

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

// Update 

export const updateEmployees = async (req: Request , res: Response) => {
    try {
         const result = updateEmployeeSchema.safeParse(req.body)
         

        if(!result.success) {
          const fieldErrors = z.flattenError(result.error)
          res.status(400).json({message: "An error occurred in updating an employee profile" , error: fieldErrors.fieldErrors})
          return;
        }
       
        const newData = result.data;

        const updateProfile = await prisma.employees.update({
            where: {phone : newData.phone},
            data: newData
        })

        res.status(200).json({message:"Profile updated" , data: updateProfile})

    } catch (error) {
        res.status(500).json({message:"Internal server error"})
        console.log(error)
    }
};

