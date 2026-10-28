import {Request , Response} from "express";
import {prisma} from "../lib/prisma.js"
import { fullOrderInclude } from "../orders/order.include.js";
import { updateEmployeeSchema } from "./admin.schema.js";
import * as z from "zod";
import { manyCustomerSchema, updateProfileSchema } from "../crm/crm.schema.js";
import { CreateIdentifier } from "../utilities/counter.js";

 const WELCOME_BONUS = 20;

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

export const updateEmployees = async (req: Request , res: Response): Promise<void> => {
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


export const createManyCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = manyCustomerSchema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = z.flattenError(result.error);
      res.status(400).json({
        error: { message: "Error in creating customers in bulk", details: fieldErrors.fieldErrors },
      });
      return;
    }

    const data = result.data;

    // Find existing phones in one query
    const existing = await prisma.customers.findMany({
      where: { phone: { in: data.map((c) => c.phone) } },
      select: { phone: true },
    });
    const existingPhones = existing.map((e) => e.phone);

    // Keep only customers not already in V2, and give each one an empty customerId slot
    const newCustomers = data
      .filter((c) => !existingPhones.includes(c.phone))
      .map((c) => ({ customerId: "", ...c }));

    // Fill in the real IDs one at a time
    for (const c of newCustomers) {
      c.customerId = await CreateIdentifier("CUST");
    }
   
    const newAccounts = newCustomers.map((c) => ({ customerId: c.customerId , balance: WELCOME_BONUS}));

    const inserted = await prisma.$transaction(async (tx) => {
      const createdCustomers = await tx.customers.createMany({ data: newCustomers });
      await tx.accounts.createMany({ data: newAccounts });
      return createdCustomers;
    });

    res.status(201).json({
      data: { inserted: inserted.count },
      meta: { received: data.length, skippedDuplicates: data.length - inserted.count },
    });
  } catch (error) {
    console.error("createManyCustomers failed:", error);
    res.status(500).json({ error: { message: "Failed to create customers in bulk" } });
  }
};