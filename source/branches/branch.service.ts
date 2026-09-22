
import {prisma} from "../lib/prisma";
import {Request, Response} from "express";
import { branchSchema , shippingAddressSchema } from "./branch.schema";
import z from "zod";

// CREATE ENDPOINTS

// Create a single branch 
export const createBranch = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = branchSchema.safeParse(req.body);
        if(!result.success) {
            res.status(403).json({message : "Incorrect datatypes and schema " , error: result.error});
            return;
        }

        const newBranch = await prisma.branches.create({
            data: result.data,
        });

        res.status(201).json(newBranch);

    } catch (error) {
        console.error("Error creating branch:", error);
        res.status(500).json({ error: "Failed to create branch" });
    };
};
// Create many branches
export const createManyBranches = async (req: Request , res: Response): Promise<void> => {
      try {
         const result = z.array(branchSchema).safeParse(req.body);
         if (!result.success) {
            res.status(403).json({message : "Incorrect datatypes and schema " , error: result.error});
            return;
         }

        const branches = await prisma.branches.createMany({
            data: result.data
        });
         res.status(201).json(branches);
      } catch (error) {
       console.error("Error creating your branches:" , error);
       res.status(500).json({ error: "Failed to create branch" })
  };
};
// CREATE A SHIPPING ADDRESS
export const createAShippingAddress = async (req: Request , res: Response): Promise<void> => {
    try{
        const result = shippingAddressSchema.safeParse(req.body);
        if(!result.success){
            res.status(403).json({message : "Incorrect datatypes and schema " , error: result.error});
            return;
        }
        const shippingAddress =  await prisma.shippingAddresses.create({
            data: result.data
        });
         res.status(201).json({message: "Operation is Successful!" , shippingAddress});
    }catch(error) {
        console.error("Error creating your branches:" , error);
       res.status(500).json({ error: "Failed to create branch" })
    };
};
// CREATE MANY SHIPPING ADDRESSES
export const createAShippingAddresses = async (req: Request , res: Response): Promise<void> => {
    try{
        const result = z.array(shippingAddressSchema).safeParse(req.body);
        if(!result.success){
            res.status(403).json({message : "Incorrect datatypes and schema " , error: result.error});
            return;
        }
        const shippingAddresses =  await prisma.shippingAddresses.createMany({
            data: result.data
        });
         res.status(201).json({message: "Operation is Successful!" , shippingAddresses});
    }catch(error) {
        console.error("Error creating your branches:" , error);
       res.status(500).json({ error: "Failed to create branch" })
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
            where: {id}
           });
           res.status(200).json({message: "Request was successful baby" , branch})
    } catch (error) {
       console.error("Error fetching branches:", error);
       res.status(500).json({ error: "Failed to fetch branches" }); 
    }
};
// Get a shipping address
export const getAshippingAddress = async (req: Request , res: Response): Promise<void> => {
    const name = req.params.id as string
    try {
        const shippingAddress = await prisma.shippingAddresses.findUnique({
            where: {name}
        });
        res.status(200).json({message: "Request was successful baby" , shippingAddress})
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
            res.status(403).json({message : "Incorrect datatypes and schema " , error: result.error});
            return;
        }
        const branch = await prisma.branches.update({
            where: {id},
            data: result.data
        });
        res.status(200).json({message: "Branch updated successfully", branch});
    } catch (error) {
        console.error("Error updating branch:", error);
       res.status(500).json({ error: "Failed to update branch" });
    }
};
// Update a Shipping Address
export const updateShippingAddresses = async (req: Request , res: Response): Promise<void> => {
    const id = req.params.id as string;
    try {
        const result = shippingAddressSchema.partial().safeParse(req.body);
        if(!result.success) {
            res.status(403).json({message : "Incorrect datatypes and schema " , error: result.error});
            return;
        }
        const shippingAddress = await prisma.branches.update({
            where: {id},
            data: result.data
        });
        res.status(200).json({message: "Branch updated successfully", shippingAddress});
    } catch (error) {
        console.error("Error updating branch:", error);
       res.status(500).json({ error: "Failed to update branch" });
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
       res.status(500).json({ error: "Failed to delete branch" });
    }
};
// Delete many branches
export const deleteManyBranches = async (req: Request , res: Response): Promise<void> => {
    try {
        const result = z.array(z.string()).safeParse(req.body);
        if(!result.success) {
            res.status(403).json({message : "Incorrect datatypes and schema " , error: result.error});
            return;
        }
        const branches = await prisma.branches.deleteMany({
            where: { id: { in: result.data } }
        });
        res.status(200).json({message: "Branches deleted successfully", branches});
    } catch (error) {
        console.error("Error deleting branches:", error);
       res.status(500).json({ error: "Failed to delete branches" });
    }
};
// Delete a shipping address
export const deleteShippingAddress = async (req: Request , res: Response): Promise<void> => {
    const name = req.params.id as string;
    try {
        const shippingAddress = await prisma.shippingAddresses.delete({
            where: {name}
        });
        res.status(200).json({message: "Shipping address deleted successfully", shippingAddress});
    } catch (error) {
        console.error("Error deleting shipping address:", error);
       res.status(500).json({ error: "Failed to delete shipping address" });
    }
};
// Delete many shipping addresses
export const deleteManyShippingAddresses = async (req: Request , res: Response): Promise<void> => {
    try {
        const result = z.array(z.string()).safeParse(req.body);
        if(!result.success) {
            res.status(403).json({message : "Incorrect datatypes and schema" , error: result.error});
            return;
        }
        const shippingAddresses = await prisma.shippingAddresses.deleteMany({
            where: { name: { in: result.data } }
        });
        res.status(200).json({message: "Shipping addresses deleted successfully", shippingAddresses});
    } catch (error) {
        console.error("Error deleting shipping addresses:", error);
       res.status(500).json({ error: "Failed to delete shipping addresses" });
    }
};
