
import {prisma} from "../lib/prisma";
import {Request, Response} from "express";

interface Address {
    name: string;
    region: string;
    city: string;
    neighborhood: string;
    deliveryFee: number;
    deliveryTime: number;
    branchId: string;

}


const createAddress = async (req: Request, res: Response): Promise<void> => {
     try {
        const { name, region, city, neighborhood, deliveryFee, deliveryTime, branchId }: Address = req.body;

        const newAddress = await prisma.shippingAddresses.create({
            data: {
                name,
                region,
                city,
                neighborhood,
                deliveryFee,
                deliveryTime,
                branchId,
            },
        })
    res.status(201).json(newAddress);
     } catch (error) {
        console.error("Error creating address:", error);
        res.status(500).json({ error: "Failed to create address" });
     };
};

const getAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
        const addresses = await prisma.shippingAddresses.findMany();
        res.status(200).json(addresses);
    }
    catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).json({ error: "Failed to fetch addresses" });
    }   
};

export {createAddress, getAddresses};