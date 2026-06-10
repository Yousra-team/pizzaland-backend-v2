import {prisma} from "../lib/prisma";
import {Request, Response} from "express";

interface User {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    role : string;
}



const registerUser = async (req: Request, res: Response): Promise<void> => {

  try {

     const role = req.body.role;

     if (role) {
          const { firstName, lastName, email, phone, password }: User = req.body;

          const existingEmployee = await prisma.employees.findUnique({
            where: {
              email: email,
            },
          });

            if (existingEmployee) { 
                res.status(400).json({ error: "Employee with this email already exists" });
            };
        const newEmployee = await prisma.employees.create({
            data: {
              firstName,
              lastName,
              email,
              phone,
              password,
              role,
            },
          });
          res.status(201).json(newEmployee);
        }

    const { firstName, lastName, email, phone }: User = req.body;

    const existingCustomer = await prisma.customers.findUnique({
      where: {
        phone: phone,
      },
    });

    if (existingCustomer) { 
         res.status(400).json({ error: "Customer with this phone number already exists" });
    } else {

      const newCustomer = await prisma.customers.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
        },
      });
      res.status(201).json(newCustomer);
    }


  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
};

const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password , phone}: User = req.body;
    
    const employee = await prisma.employees.findUnique({
      where: {
        email: email,
      },
    });

    if (employee) {
      if (employee.password === password) {
        res.status(200).json({ message: "Employee login successful" });
      } else {
        res.status(401).json({ error: "Invalid password" });
      }

    const customer = await prisma.customers.findUnique({
       where: {
        phone: phone,
       },
    });

    if (customer) {
        res.status(200).json({ message: "Customer login successful" });
    }
    }

  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({ error: "Failed to log in user" });
  }
};


export {
    registerUser,
    loginUser,
}