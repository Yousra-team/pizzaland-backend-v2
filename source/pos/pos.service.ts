import {prisma} from "../lib/prisma.js";
import {Request , Response , NextFunction} from "express";
import { fullOrderInclude } from "../orders/order.include.js";


export const myCashierOrWaitressHistory = async (req: Request, res: Response) => {
    try {
        const email = req.user.Id;

        if (!email) {
            res.status(400).json({ error: { message: "Email not found" } });
            return;
        }

        const employee = await prisma.employees.findUnique({
            where: { email },
        });

        if (!employee) {
            res.status(404).json({ error: { message: "Employee not found" } });
            return;
        }

        let myOrders;

        if (employee.role === "CASHIER") {
            myOrders = await prisma.orders.findMany({
                where: { cashierEmail: email },
                include: fullOrderInclude,
            });
        } else if (employee.role === "WAITER") {
            myOrders = await prisma.orders.findMany({
                where: { employeeEmail: email },
                include: fullOrderInclude,
            });
        } else {
            res.status(403).json({ error: { message: "Only cashiers and waiters can access this" } });
            return;
        }

        res.status(200).json({ data: myOrders });
        return;

    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ error: { message: "Failed to fetch order history" } });
        return;
    }
};