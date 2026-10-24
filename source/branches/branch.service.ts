import { prisma } from "../lib/prisma.js";
import { Request, Response } from "express";
import { branchSchema, shippingAddressSchema } from "./branch.schema.js";
import z from "zod";

// CREATE ENDPOINTS

// Create a single branch
export const createBranch = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = branchSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ message: "Incorrect datatypes and schema", error: result.error });
            return;
        }

        const newBranch = await prisma.branches.create({ data: result.data });
        res.status(201).json(newBranch);
    } catch (error) {
        console.error("Error creating branch:", error);
        res.status(500).json({ error: "Failed to create branch" });
    }
};

// Create many branches
export const createManyBranches = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = z.array(branchSchema).min(1).safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ message: "Incorrect datatypes and schema", error: result.error });
            return;
        }

        const branches = await prisma.branches.createMany({ data: result.data });
        res.status(201).json(branches);
    } catch (error) {
        console.error("Error creating branches:", error);
        res.status(500).json({ error: "Failed to create branches" });
    }
};

// Create a shipping address
export const createShippingAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = shippingAddressSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ message: "Incorrect datatypes and schema", error: result.error });
            return;
        }

        const shippingAddress = await prisma.shippingAddresses.create({ data: result.data });
        res.status(201).json({ message: "Operation is Successful!", shippingAddress });
    } catch (error) {
        console.error("Error creating shipping address:", error);
        res.status(500).json({ error: "Failed to create shipping address" });
    }
};

// Create many shipping addresses
export const createManyShippingAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = z.array(shippingAddressSchema).min(1).safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ message: "Incorrect datatypes and schema", error: result.error });
            return;
        }

        const shippingAddresses = await prisma.shippingAddresses.createMany({ data: result.data });
        res.status(201).json({ message: "Operation is Successful!", shippingAddresses });
    } catch (error) {
        console.error("Error creating shipping addresses:", error);
        res.status(500).json({ error: "Failed to create shipping addresses" });
    }
};
// GET ENDPOINTS

// Get all branches
export const getBranches = async (req: Request, res: Response): Promise<void> => {
    try {
        const branches = await prisma.branches.findMany();
        res.status(200).json(branches);
    } catch (error) {
        console.error("Error fetching branches:", error);
        res.status(500).json({ error: "Failed to fetch branches" });
    }
};

// Get a branch by id
export const getAbranchById = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    try {
        const branch = await prisma.branches.findUnique({
            where: { id },
            include: { shippingAddresses: true }
        });
        if (!branch) {
            res.status(404).json({ error: "Branch not found" });
            return;
        }
        res.status(200).json({ message: "Request was successful", branch });
    } catch (error) {
        console.error("Error fetching branch:", error);
        res.status(500).json({ error: "Failed to fetch branch" });
    }
};

// Get a shipping address by name
export const getAshippingAddress = async (req: Request, res: Response): Promise<void> => {
    const name = req.params.name as string;
    try {
        const shippingAddress = await prisma.shippingAddresses.findUnique({ where: { name } });
        if (!shippingAddress) {
            res.status(404).json({ error: "Shipping address not found" });
            return;
        }
        res.status(200).json({ message: "Request was successful", shippingAddress });
    } catch (error) {
        console.error("Error fetching address:", error);
        res.status(500).json({ error: "Failed to fetch address" });
    }
};

// Get many shipping addresses
export const getManyShippingAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
        const shippingAddresses = await prisma.shippingAddresses.findMany();
        res.status(200).json(shippingAddresses);
    } catch (error) {
        console.error("Error fetching address:", error);
        res.status(500).json({ error: "Failed to fetch address" });
    }
};

// UPDATE ENDPOINTS

// Update a branch
export const updateBranches = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    try {
        const result = branchSchema.partial().safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ message: "Incorrect datatypes and schema", error: result.error });
            return;
        }

        const exists = await prisma.branches.findUnique({ where: { id } });
        if (!exists) {
            res.status(404).json({ error: "Branch not found" });
            return;
        }

        const branch = await prisma.branches.update({ where: { id }, data: result.data });
        res.status(200).json({ message: "Branch updated successfully", branch });
    } catch (error) {
        console.error("Error updating branch:", error);
        res.status(500).json({ error: "Failed to update branch" });
    }
};

// Update a shipping address
export const updateShippingAddresses = async (req: Request, res: Response): Promise<void> => {
    const name = req.params.name as string;
    try {
        const result = shippingAddressSchema.partial().safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ message: "Incorrect datatypes and schema", error: result.error });
            return;
        }

        const exists = await prisma.shippingAddresses.findUnique({ where: { name } });
        if (!exists) {
            res.status(404).json({ error: "Shipping address not found" });
            return;
        }

        const shippingAddress = await prisma.shippingAddresses.update({ where: { name }, data: result.data });
        res.status(200).json({ message: "Shipping address updated successfully", shippingAddress });
    } catch (error) {
        console.error("Error updating shipping address:", error);
        res.status(500).json({ error: "Failed to update shipping address" });
    }
};

// DELETE ENDPOINTS

// Delete a branch
export const deleteBranch = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    try {
        const exists = await prisma.branches.findUnique({ where: { id } });
        if (!exists) {
            res.status(404).json({ error: "Branch not found" });
            return;
        }

        const branch = await prisma.branches.delete({ where: { id } });
        res.status(200).json({ message: "Branch deleted successfully", branch });
    } catch (error) {
        console.error("Error deleting branch:", error);
        res.status(500).json({ error: "Failed to delete branch" });
    }
};

// Delete many branches
export const deleteManyBranches = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = z.array(z.string()).min(1).safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ message: "Incorrect datatypes and schema", error: result.error });
            return;
        }

        const branches = await prisma.branches.deleteMany({ where: { id: { in: result.data } } });
        res.status(200).json({ message: "Branches deleted successfully", branches });
    } catch (error) {
        console.error("Error deleting branches:", error);
        res.status(500).json({ error: "Failed to delete branches" });
    }
};

// Delete a shipping address
export const deleteShippingAddress = async (req: Request, res: Response): Promise<void> => {
    const name = req.params.name as string;
    try {
        const exists = await prisma.shippingAddresses.findUnique({ where: { name } });
        if (!exists) {
            res.status(404).json({ error: "Shipping address not found" });
            return;
        }

        const shippingAddress = await prisma.shippingAddresses.delete({ where: { name } });
        res.status(200).json({ message: "Shipping address deleted successfully", shippingAddress });
    } catch (error) {
        console.error("Error deleting shipping address:", error);
        res.status(500).json({ error: "Failed to delete shipping address" });
    }
};

// Delete many shipping addresses
export const deleteManyShippingAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = z.array(z.string()).min(1).safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ message: "Incorrect datatypes and schema", error: result.error });
            return;
        }

        const shippingAddresses = await prisma.shippingAddresses.deleteMany({ where: { name: { in: result.data } } });
        res.status(200).json({ message: "Shipping addresses deleted successfully", shippingAddresses });
    } catch (error) {
        console.error("Error deleting shipping addresses:", error);
        res.status(500).json({ error: "Failed to delete shipping addresses" });
    }
};