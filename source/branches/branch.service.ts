
import {prisma} from "../lib/prisma";
import {Request, Response} from "express";
import { branchSchema , shippingAddressSchema } from "./branch.schema";
import z from "zod";

// Maps known Prisma errors to HTTP responses; returns true if it handled the error
const handlePrismaError = (error: any, res: Response, notFoundMessage: string): boolean => {
    switch (error?.code) {
        case "P2025": // record to update/delete not found
            res.status(404).json({ error: notFoundMessage });
            return true;
        case "P2002": // unique constraint (e.g. duplicate managerEmail or shipping address name)
            res.status(409).json({ error: "A record with this value already exists", fields: error.meta?.target });
            return true;
        case "P2003": // foreign key: referenced record missing, or record still referenced by others
            res.status(409).json({ error: "Related record missing or record is still in use", field: error.meta?.field_name });
            return true;
        default:
            return false;
    }
};

// CREATE ENDPOINTS

// Create a single branch
export const createBranch = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = branchSchema.safeParse(req.body);
        if(!result.success) {
            res.status(400).json({message : "Incorrect datatypes and schema" , error: result.error});
            return;
        }

        const newBranch = await prisma.branches.create({
            data: result.data,
        });

        res.status(201).json(newBranch);

    } catch (error) {
        console.error("Error creating branch:", error);
        if (handlePrismaError(error, res, "Branch not found")) return;
        res.status(500).json({ error: "Failed to create branch" });
    };
};
// Create many branches
export const createManyBranches = async (req: Request , res: Response): Promise<void> => {
      try {
         const result = z.array(branchSchema).min(1).safeParse(req.body);
         if (!result.success) {
            res.status(400).json({message : "Incorrect datatypes and schema" , error: result.error});
            return;
         }

        const branches = await prisma.branches.createMany({
            data: result.data
        });
         res.status(201).json(branches);
      } catch (error) {
       console.error("Error creating your branches:" , error);
       if (handlePrismaError(error, res, "Branch not found")) return;
       res.status(500).json({ error: "Failed to create branches" })
  };
};
// CREATE A SHIPPING ADDRESS
export const createShippingAddress = async (req: Request , res: Response): Promise<void> => {
    try{
        const result = shippingAddressSchema.safeParse(req.body);
        if(!result.success){
            res.status(400).json({message : "Incorrect datatypes and schema" , error: result.error});
            return;
        }
        const shippingAddress =  await prisma.shippingAddresses.create({
            data: result.data
        });
         res.status(201).json({message: "Operation is Successful!" , shippingAddress});
    }catch(error) {
        console.error("Error creating shipping address:" , error);
        if (handlePrismaError(error, res, "Shipping address not found")) return;
        res.status(500).json({ error: "Failed to create shipping address" })
    };
};
// CREATE MANY SHIPPING ADDRESSES
export const createManyShippingAddresses = async (req: Request , res: Response): Promise<void> => {
    try{
        const result = z.array(shippingAddressSchema).min(1).safeParse(req.body);
        if(!result.success){
            res.status(400).json({message : "Incorrect datatypes and schema" , error: result.error});
            return;
        }
        const shippingAddresses =  await prisma.shippingAddresses.createMany({
            data: result.data
        });
         res.status(201).json({message: "Operation is Successful!" , shippingAddresses});
    }catch(error) {
        console.error("Error creating shipping addresses:" , error);
        if (handlePrismaError(error, res, "Shipping address not found")) return;
        res.status(500).json({ error: "Failed to create shipping addresses" })
    };
};

// GET ENDPOINTS:
//Get branches
export const getBranches = async (req: Request, res: Response): Promise<void> => {
    try {
        const branches = await prisma.branches.findMany();
        res.status(200).json(branches);
    } catch (error) {
        console.error("Error fetching branches:", error);
        res.status(500).json({ error: "Failed to fetch branches" });
    }
};
//Get a branch
export const getAbranchById = async (req: Request , res: Response): Promise<void> => {
    const id = req.params.id as string
    try {
        const branch = await prisma.branches.findUnique({
            where: {id},
            include: { shippingAddresses: true }
        });
        if (!branch) {
            res.status(404).json({ error: "Branch not found" });
            return;
        }
        res.status(200).json({message: "Request was successful" , branch})
    } catch (error) {
       console.error("Error fetching branch:", error);
       res.status(500).json({ error: "Failed to fetch branch" });
    }
};
// Get a shipping address (its name is the primary key)
export const getAshippingAddress = async (req: Request , res: Response): Promise<void> => {
    const name = req.params.name as string
    try {
        const shippingAddress = await prisma.shippingAddresses.findUnique({
            where: {name}
        });
        if (!shippingAddress) {
            res.status(404).json({ error: "Shipping address not found" });
            return;
        }
        res.status(200).json({message: "Request was successful" , shippingAddress})
    } catch (error) {
        console.error("Error fetching address:", error);
       res.status(500).json({ error: "Failed to fetch address" });
    }
};
// Get many shipping addresses
export const getManyShippingAddresses = async (req: Request , res: Response): Promise<void> => {

    try {
        const shippingAddresses = await prisma.shippingAddresses.findMany();
        res.status(200).json(shippingAddresses)
    } catch (error) {
        console.error("Error fetching address:", error);
       res.status(500).json({ error: "Failed to fetch address" });
    }
};

// UPDATE ENDPOINTS
//Update a Branch
export const updateBranches = async (req: Request , res: Response): Promise<void> => {
    const id = req.params.id as string;
    try {
        const result = branchSchema.partial().safeParse(req.body);
        if(!result.success) {
            res.status(400).json({message : "Incorrect datatypes and schema" , error: result.error});
            return;
        }
        const branch = await prisma.branches.update({
            where: {id},
            data: result.data
        });
        res.status(200).json({message: "Branch updated successfully", branch});
    } catch (error) {
        console.error("Error updating branch:", error);
        if (handlePrismaError(error, res, "Branch not found")) return;
       res.status(500).json({ error: "Failed to update branch" });
    }
};
// Update a Shipping Address
export const updateShippingAddresses = async (req: Request , res: Response): Promise<void> => {
    const name = req.params.name as string;
    try {
        const result = shippingAddressSchema.partial().safeParse(req.body);
        if(!result.success) {
            res.status(400).json({message : "Incorrect datatypes and schema" , error: result.error});
            return;
        }
        const shippingAddress = await prisma.shippingAddresses.update({
            where: {name},
            data: result.data
        });
        res.status(200).json({message: "Shipping address updated successfully", shippingAddress});
    } catch (error) {
        console.error("Error updating shipping address:", error);
        if (handlePrismaError(error, res, "Shipping address not found")) return;
       res.status(500).json({ error: "Failed to update shipping address" });
    }
};

//DELETE ENDPOINTS
// Delete a branch
export const deleteBranch = async (req: Request , res: Response): Promise<void> => {
    const id = req.params.id as string;
    try {
        const branch = await prisma.branches.delete({
            where: {id}
        });
        res.status(200).json({message: "Branch deleted successfully", branch});
    } catch (error) {
        console.error("Error deleting branch:", error);
        if (handlePrismaError(error, res, "Branch not found")) return;
       res.status(500).json({ error: "Failed to delete branch" });
    }
};
// Delete many branches (body: array of branch ids)
export const deleteManyBranches = async (req: Request , res: Response): Promise<void> => {
    try {
        const result = z.array(z.string()).min(1).safeParse(req.body);
        if(!result.success) {
            res.status(400).json({message : "Incorrect datatypes and schema" , error: result.error});
            return;
        }
        const branches = await prisma.branches.deleteMany({
            where: { id: { in: result.data } }
        });
        res.status(200).json({message: "Branches deleted successfully", branches});
    } catch (error) {
        console.error("Error deleting branches:", error);
        if (handlePrismaError(error, res, "Branch not found")) return;
       res.status(500).json({ error: "Failed to delete branches" });
    }
};
// Delete a shipping address
export const deleteShippingAddress = async (req: Request , res: Response): Promise<void> => {
    const name = req.params.name as string;
    try {
        const shippingAddress = await prisma.shippingAddresses.delete({
            where: {name}
        });
        res.status(200).json({message: "Shipping address deleted successfully", shippingAddress});
    } catch (error) {
        console.error("Error deleting shipping address:", error);
        if (handlePrismaError(error, res, "Shipping address not found")) return;
       res.status(500).json({ error: "Failed to delete shipping address" });
    }
};
// Delete many shipping addresses (body: array of shipping address names)
export const deleteManyShippingAddresses = async (req: Request , res: Response): Promise<void> => {
    try {
        const result = z.array(z.string()).min(1).safeParse(req.body);
        if(!result.success) {
            res.status(400).json({message : "Incorrect datatypes and schema" , error: result.error});
            return;
        }
        const shippingAddresses = await prisma.shippingAddresses.deleteMany({
            where: { name: { in: result.data } }
        });
        res.status(200).json({message: "Shipping addresses deleted successfully", shippingAddresses});
    } catch (error) {
        console.error("Error deleting shipping addresses:", error);
        if (handlePrismaError(error, res, "Shipping address not found")) return;
       res.status(500).json({ error: "Failed to delete shipping addresses" });
    }
};
