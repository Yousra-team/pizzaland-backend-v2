import {prisma} from "../lib/prisma.js";
import {Request , Response , NextFunction} from "express";
import { fullOrderInclude } from "../orders/order.include.js";

export const myCashierOrWaitressHistory = async (req: Request , res: Response) => {
    try {
       const email = req.user.Id 
       
       if(!email) {
        res.status(400).json({message:"This email does not exist"})
        return;
       }

       const employee = await prisma.employees.findUnique({
         where: {email}
       });

       if(!employee) {
         res.status(400).json({message: "This Cashier does not exist"})
         return;
       }
       
       if(employee.role == "CASHIER") {
        
       const myOrders = await prisma.orders.findMany({
         where: {cashierEmail: email},
         include: fullOrderInclude
       });
    }

     if (employee.role == "WAITER") {
         const myOrders = await prisma.orders.findMany({
            where: {waitressEmail: employee.email},
            include: fullOrderInclude
         })
     };

    } catch (error) {
      res.status(500).json({message: "There is an internal server error with cashier history"})
      console.log(error)
    }
};

