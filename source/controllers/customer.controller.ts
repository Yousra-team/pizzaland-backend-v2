import {prisma} from "../lib/prisma";
import {Request, Response} from "express";

const createCustomer = async (req: Request, res: Response) => {
    try{
        const {firstName , lastName , email , phone} = req.body;

        const existingCustomer = await prisma.customers.findUnique({
            where: {
                phone: phone,
            },
        });

        if (existingCustomer) {
            return res.status(400).json({ error: "Customer with this phone number already exists" });
        }
        const newCustomer = await prisma.customers.create({
            data: {
                firstName,
                lastName,
                email,
                phone,
            },
        });
        res.status(201).json(newCustomer);


    }catch(error){
        console.error("Error creating customer:", error);
        res.status(500).json({ error: "Failed to create customer" });
    }

}

const getAllCustomers = async (req: Request, res: Response) => {
    try {
        const customers = await prisma.customers.findMany();    
        res.status(200).json(customers);
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ error: "Failed to fetch customers" });
    }

};

export {
    createCustomer,
    getAllCustomers
}