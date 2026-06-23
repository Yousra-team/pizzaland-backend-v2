import {prisma} from "../lib/prisma";
import {Request, Response} from "express";


interface Customer {
    firstName: string;
    lastName: string;
    email: string;
    dateOfBirth: Date;
    phone: string;
    gender : "Male" | "Female" | "Other";
    address?: string;
}



const createCustomer = async (req: Request, res: Response): Promise<void> => {
    try{
        const {firstName , lastName , email , phone, dateOfBirth, gender, address} : Customer = req.body;

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
                dateOfBirth,
                gender,
                address
            },
        });

         res.status(201).json(newCustomer);


    }catch(error){
        console.error("Error creating customer:", error);
        res.status(500).json({ error: "Failed to create customer" });
    }

};

const createManyCustomers = async (req: Request, res: Response): Promise<void> => {
    // For testing purposes, you can send an array of customers in the request body to create multiple customers at once.
    try{
        const customers: Customer[] = req.body;

        const createdCustomers = await prisma.customers.createMany({
            data: customers,
            skipDuplicates: true, // This will skip any duplicate entries based on unique constraints
        });
        res.status(201).json(createdCustomers);

    }catch(error){
        console.error("Error creating many customers:", error);
        res.status(500).json({ error: "Failed to create many customers" });
    }
};

const getCustomers = async (req: Request, res: Response): Promise<void> => {

    try {
           
        const { gender, address, dateOfBirth } = req.query;

        let filter: any = {};

        if (gender) {
            filter.gender = gender;
        }
    
        if (address) {
            filter.address = {
                contains: address as string,
            };
        }

        if (dateOfBirth) {
            filter.dateOfBirth = new Date(dateOfBirth as string);
        }

        const customers = await prisma.customers.findMany({
            where: filter
        });
        res.status(200).json(customers);

    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ error: "Failed to fetch customers" });
    }

};

const getCustomerByPhone = async (req: Request, res: Response): Promise<void> => {
    try {
        const { phone } = req.params;

        const customer = await prisma.customers.findUnique({
            where: {
                phone: phone,
            },
        });

        if (!customer) {
         res.status(404).json({ error: "Customer not found" });
        }

        res.status(200).json(customer);
    } catch (error) {
        console.error("Error fetching customer by phone:", error);
        res.status(500).json({ error: "Failed to fetch customer by phone" });
    }
};

const updateCustomer = async (req: Request, res: Response): Promise<void> => {
    try {
        const { phone } = req.params;
        const { firstName, lastName, email , dateOfBirth, gender } : Customer = req.body;
        const  updatedCustomer = await prisma.customers.update({
            where: {
                phone: phone,
            },
            data: {
                firstName,
                lastName,
                email,
                dateOfBirth,
                gender
            },
        });
        res.status(200).json(updatedCustomer);
       




    } catch (error) {
        console.error("Error updating customer:", error);
        res.status(500).json({ error: "Failed to update customer" });
    }
};

export {
    createCustomer,
    getCustomers,
    getCustomerByPhone,
    updateCustomer,
    createManyCustomers
};