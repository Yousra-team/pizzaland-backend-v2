import {prisma} from "../lib/prisma";
import {Request, Response} from "express";


interface Customer {
    firstName: string;
    lastName: string;
    email: string;
    dateOfBirth: Date;
}

type Gender = "male" | "female" | "other";

const createCustomer = async (req: Request, res: Response): Promise<void> => {
    try{
        const {firstName , lastName , email , phone, dateOfBirth, gender} = req.body;

        const existingCustomer = await prisma.customers.findUnique({
            where: {
                phone: phone,
            },
        });

        if (existingCustomer) {
            res.status(400).json({ error: "Customer with this phone number already exists" });
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
        return res.status(200).json(customers);
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ error: "Failed to fetch customers" });
    }

};

const updateCustomer = async (req: Request, res: Response): Promise<void> => {
    try {
        const { phone } = req.params;
        const { firstName, lastName, email , dateOfBirth  }  = req.body;
        const  updatedCustomer = await prisma.customers.update({
            where: {
                phone: phone,
            },
            data: {
                firstName,
                lastName,
                email,
                dateOfBirth,
                gender,
            },
        });
        res.status(200).json(updatedCustomer);
       




    } catch (error) {

    }
}

export {
    createCustomer,
    getAllCustomers,
    updateCustomer
}