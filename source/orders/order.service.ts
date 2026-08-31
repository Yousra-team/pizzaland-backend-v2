import {prisma} from "../lib/prisma";
import {Request, Response} from "express";
import {orderSchema , deliverySchema , dineIn } from "./order.schema";


export const createOrder = async (req: Request, res: Response): Promise<void> => {
     const result = orderSchema.safeParse(req.body);
     if (!result.success) {
         res.status(400).json({ error: result.error});
         return;
     }
     const {number , branchId , cashierEmail , customerPhone , employeeEmail , discount , subtotal , total , orderType, status} = result.data;
     const {items} = result.data.items;
     const  order = await prisma.$transaction(async (tx) => {
           const newOrder = await tx.orders.create({
               data: {
                   number,
                   branchId,
                   cashierEmail,
                   customerPhone,
                   employeeEmail,
                   discount,
                   subtotal,
                   total,
                   orderType,
                   status,
               },
           });

           const newOrderItems = await tx.orderItems.createMany({
               data: items.map((item: any) =>({
                   ...item,
                   orderNumber : newOrder.number,
               }))
           });

           if (newOrder.orderType === "delivery") {
                const delivery = deliverySchema.safeParse(req.body.delivery);
                if (!delivery.success) {
                    res.status(400).json({ error: delivery.error});
                    return;
                }
                const {orderNumber, driverEmail , status , estimatedDeliveryTime , actualDeliveryTime, shippingAddressName} = delivery.data;

                const newDelivery = await tx.deliveries.create({
                    data: {
                        orderNumber,
                        driverEmail,
                        status,
                        estimatedDeliveryTime,
                        actualDeliveryTime,
                        shippingAddressName,
                    },

                });
     } else if (newOrder.orderType === "dineIn" ) {
            const dine = dineIn.safeParse(req.body.dineIn);
            if (!dine.success) {
                res.status(400).json({ error: dine.error});
                return;
            }
           const { orderNumber , table} = dine.data;


           }
         }
           );



};