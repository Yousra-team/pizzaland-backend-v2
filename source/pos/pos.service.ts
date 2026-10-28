// source/pos/pos.service.ts
import { prisma } from "../lib/prisma.js";
import { Request, Response } from "express";
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
            select: { role: true },
        });
        if (!employee) {
            res.status(404).json({ error: { message: "Employee not found" } });
            return;
        }

        if (employee.role !== "CASHIER" && employee.role !== "WAITER" && employee.role !== "MANAGER") {
             res.status(403).json({
            error: { message: "Only cashiers, waiters, and managers can access this" },
          });
        return;
}
        // Who placed an order lives on the first OrderStatusHistory row:
        //   fromStatus = null, toStatus = pending, changedByEmail = this employee.
        // So "orders I placed" = orders that have such a row for me.
        const myOrders = await prisma.orders.findMany({
            where: {
                statusHistory: {
                    some: {
                        fromStatus: null,          // creation row only
                        changedByEmail: email,
                    },
                },
            },
            include: fullOrderInclude,
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({ data: myOrders });
        return;

    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ error: { message: "Failed to fetch order history" } });
        return;
    }
};