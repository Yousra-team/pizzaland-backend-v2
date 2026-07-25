
import {prisma} from "../lib/prisma";
import {Request, Response} from "express";
import * as Z from "zod";


const branchSchema = Z.object({
    name: Z.string().min(1, "Name is required"),
    region: Z.string().min(1, "Region is required"),
    city: Z.string().min(1, "City is required"),
    neighborhood: Z.string().min(1, "Neighborhood is required")
});



const createBranch = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, region, city, neighborhood} = branchSchema.parse(req.body);

        const newBranch = await prisma.branches.create({
            data: {
                name,
                region,
                city,
                neighborhood,
            }
        });

        res.status(201).json(newBranch);

    } catch (error) {
        console.error("Error creating branch:", error);
        res.status(500).json({ error: "Failed to create branch" });
    };
};

const getBranches = async (req: Request, res: Response): Promise<void> => {
    try {
        const branches = await prisma.branches.findMany();
        res.status(200).json(branches);
    } catch (error) {
        console.error("Error fetching branches:", error);
        res.status(500).json({ error: "Failed to fetch branches" });
    }
};

export {createBranch, getBranches};