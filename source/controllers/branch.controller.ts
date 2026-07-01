
import {prisma} from "../lib/prisma";
import {Request, Response} from "express";

interface branch {
    name: string;
    region: string;
    city: string;
    neighborhood: string;
}


const createBranch = async (req: Request, res: Response): Promise<void> => {
     try {
        const { name, region, city, neighborhood}: branch = req.body;

        const newBranch = await prisma.branches.create({
            data: {
                name,
                region,
                city,
                neighborhood // governance
                // ai persona
                //organizational resources to achieve goals 
                // continual improvement at all levels
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