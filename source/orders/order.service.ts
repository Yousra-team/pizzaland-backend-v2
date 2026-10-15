
import { prisma } from "../lib/prisma.js";
import { Request, Response } from "express";
import { createOrderSchema , orderStatusQuerySchema , statusEnum , orderItemSchema, updateOrderSchema , deleteOrderSchema , markItemStatusSchema} from "./order.schema.js";
import { fullOrderInclude } from "./order.include.js";
import * as z from "zod";
import { creditAccount , convertToYousraCoins } from "../crm/account.js";


// Helper Functions


// CREATE ENDPOINTS

// Place an Order
export const placeOrder = async (req: Request, res: Response): Promise<void> => {
    try {
        // Step 1: validate the request body
        const result = createOrderSchema.safeParse(req.body);
        if (!result.success) {
            const fieldErrors = z.flattenError(result.error);
            res.status(400).json({ message: "Invalid Schema", error: fieldErrors.fieldErrors });
            return;
        }

        const data = result.data;

        // Step 2: find out who is ordering
        let actor: string;

        if (req.user.role === "CUSTOMER") {
            actor = "CUSTOMER";
        } else if (data.customerPhone) {
            actor = "STAFF";      // staff ordering on behalf of a customer
        } else {
            actor = "EMPLOYEE";   // staff ordering for themselves
        }

        // Step 3: everything below runs in one transaction
        const newOrder = await prisma.$transaction(async (tx) => {

            // Step 4: loop through the items, get prices and prep times
            let subtotal = 0;
            let longestPrepTime = 0;
            const itemsToCreate = [];

            for (const item of data.items) {
                let price: number | undefined;
                let prepTime = 0;

                if (item.type === "product") {
                    const product = await tx.products.findUnique({
                        where: { id: item.productId! },
                        select: { price: true, preparationTime: true },
                    });
                    if (!product) {
                        throw new Error("Product not found");
                    }
                    price = product.price;
                    prepTime = product.preparationTime ?? 0;

                    if (item.productVariantId) {
                        const variant = await tx.productVariants.findUnique({
                            where: { id: item.productVariantId },
                            select: { price: true, productId: true },
                        });
                        if (!variant || variant.productId !== item.productId) {
                            throw new Error("Variant does not belong to this product");
                        }
                        price = variant.price;
                    }
                }

                if (item.type === "menu") {
                  const menu = await tx.menu.findUnique({
                         where: { id: item.menuId! },
                         select: { price: true, preparationTime: true },
                         });
                         if (!menu) {
                          throw new Error("Menu not found");
                       }
                      price = menu.price;
                      prepTime = menu.preparationTime ?? 0;
                    
                 }

                if (item.type === "addons") {
                    const addon = await tx.addons.findUnique({
                        where: { id: item.addonId! },
                        select: { price: true },
                    });
                    if (!addon) {
                        throw new Error("Addon not found");
                    }
                    price = addon.price;
                }

                if (price === undefined) {
                    throw new Error(`Price not found for item type ${item.type}`);
                }

                subtotal += price * item.quantity;

                if (prepTime > longestPrepTime) {
                    longestPrepTime = prepTime;
                }

                // Save this item's data, we create it after the order exists
                itemsToCreate.push({
                    productId: item.productId,
                    productVariantId: item.productVariantId,
                    menuId: item.menuId,
                    instructions: item.instructions,
                    quantity: item.quantity,
                    price: price,
                    type: item.type,
                    status: "pending" as const,
                    estimatedReadyAt: new Date(Date.now() + prepTime * 60 * 1000),
                });
            }

            // Round to avoid floating point issues
            subtotal = Math.round(subtotal);

            // Step 5: find the branch, delivery fee and estimated delivery time
            let deliveryFee = 0;
            let estimatedDeliveryTime: Date | null = null;
            let branchId: string;

            if (data.orderType === "delivery") {
                const shippingAddress = await tx.shippingAddresses.findUnique({
                    where: { name: data.shippingAddressName },
                    select: { deliveryFee: true, deliveryTime: true, branchId: true },
                });

                if (!shippingAddress) {
                    throw new Error("Shipping address not found");
                }

                deliveryFee = shippingAddress.deliveryFee;
                branchId = shippingAddress.branchId;

                // kitchen time + delivery time = total minutes
                const totalMinutes = longestPrepTime + shippingAddress.deliveryTime;
                estimatedDeliveryTime = new Date(Date.now() + totalMinutes * 60 * 1000);
            } else if (data.orderType === "dineIn") {
                 const table = await tx.table.findUnique({
                    where: { id: data.tableId },
                    select: { floorId: true , floor: { select: { branchId: true } } },
                });

                    if (!table) {
                    throw new Error("Table not found");
                    }

                    branchId = table.floor.branchId;
            } else {
                if (!data.branchId) {
                    throw new Error("branchId is required for dine-in orders");
                }
                //pickup  
                branchId = data.branchId;
            }

            // Step 6: totals (promotions will come later)
            const discount = 0;
            const total = subtotal - discount + deliveryFee;

            // Step 7: work out who the order belongs to
            let customerPhone: string | undefined;
            let employeeEmail: string | undefined;
            let guestName: string | undefined;

            if (actor === "CUSTOMER") {
                customerPhone = req.user.Id;
                if (!customerPhone) {
                    throw new Error("Customer phone not found");
                }
                
            } else if (actor === "STAFF") {
                customerPhone = data.customerPhone;
                employeeEmail = req.user.Id;

            } else if (actor === "EMPLOYEE") {
                employeeEmail = req.user.Id;
                if (!employeeEmail) {
                    throw new Error("Employee email not found");
                }
            } else {
                guestName = data.guestName;
            }

            // Step 8: create the order ONCE
            const order = await tx.orders.create({
                data: {
                    branchId: branchId,
                    customerPhone: customerPhone,
                    employeeEmail: employeeEmail,
                    guestName: guestName,
                    discount: discount,
                    subtotal: subtotal,
                    total: total,
                    status: "pending",
                    orderType: data.orderType,
                },
            });

            // Step 9: create the order items
            for (const item of itemsToCreate) {
                await tx.orderItems.create({
                    data: {
                        orderNumber: order.number,
                        productId: item.productId,
                        productVariantId: item.productVariantId,
                        Instructions: item.instructions,
                        menuId: item.menuId,
                        quantity: item.quantity,
                        price: item.price,
                        type: item.type,
                        status: item.status,
                        estimatedReadyAt: item.estimatedReadyAt,
                    },
                });
            }

            // Step 10: create the extra row depending on the order type
            if (data.orderType === "delivery") {
                if (!estimatedDeliveryTime) {
                    throw new Error("Estimated delivery time missing");
                }
                await tx.deliveries.create({
                    data: {
                        orderNumber: order.number,
                        shippingAddressName: data.shippingAddressName,
                        status: "pending",
                        estimatedDeliveryTime: estimatedDeliveryTime,
                    },
                });
            }

            if (data.orderType === "pickup") {
                await tx.pickupOrders.create({
                    data: {
                        orderNumber: order.number,
                        pickupTime: data.pickupTime,
                    },
                });
            }

            if (data.orderType === "dineIn") {
               await tx.dineInOrders.create({
                    data: {
                      orderNumber: order.number,
                    tableId: data.tableId,
           },
         });
}
             // Reward: 10% of the order total in Yousra coins
            // customerPhone is only set for CUSTOMER and STAFF orders
       if (customerPhone) {
               const account = await tx.accounts.findUnique({
                where: { customerPhone: customerPhone },
          });

                if (account) {
                     const coins = convertToYousraCoins(0.1 * total);

               // a very small order can round down to 0 coins
                if (coins > 0) {
                     await creditAccount(customerPhone, coins, tx);
            }
              }
         }

             return order;
           
        },
       {
            maxWait: 10000,
            timeout: 20000,
        }
    );

        // Step 11: send the result
        res.status(201).json(newOrder);

    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ error: "Failed to place order" });
    }
};

export const GuestplaceOrder = async (req: Request, res: Response): Promise<void> => {
    try {
        // Step 1: validate the request body (guest name and phone are checked here)
        const result = createOrderSchema.safeParse(req.body);
        if (!result.success) {
            const fieldErrors = z.flattenError(result.error);
            res.status(400).json({ message: "Invalid Schema", error: fieldErrors.fieldErrors });
            return;
        }

        const data = result.data;

        // Step 2: everything below runs in one transaction
        const newOrder = await prisma.$transaction(
            async (tx) => {

                // Step 3: loop through the items, get prices and prep times
                let subtotal = 0;
                let longestPrepTime = 0;
                const itemsToCreate = [];

                for (const item of data.items) {
                    let price: number | undefined;
                    let prepTime = 0;

                    if (item.type === "product") {
                        const product = await tx.products.findUnique({
                            where: { id: item.productId! },
                            select: { price: true, preparationTime: true },
                        });
                        if (!product) {
                            throw new Error("Product not found");
                        }
                        price = product.price;
                        prepTime = product.preparationTime ?? 0;

                        if (item.productVariantId) {
                            const variant = await tx.productVariants.findUnique({
                                where: { id: item.productVariantId },
                                select: { price: true, productId: true },
                            });
                            if (!variant || variant.productId !== item.productId) {
                                throw new Error("Variant does not belong to this product");
                            }
                            price = variant.price;
                        }
                    }

                    if (item.type === "menu") {
                        const menu = await tx.menu.findUnique({
                            where: { id: item.menuId! },
                            select: { price: true, preparationTime: true },
                        });
                        if (!menu) {
                            throw new Error("Menu not found");
                        }
                        price = menu.price;
                        prepTime = menu.preparationTime ?? 0;
                    }

                    if (item.type === "addons") {
                        const addon = await tx.addons.findUnique({
                            where: { id: item.addonId! },
                            select: { price: true },
                        });
                        if (!addon) {
                            throw new Error("Addon not found");
                        }
                        price = addon.price;
                    }

                    if (price === undefined) {
                        throw new Error(`Price not found for item type ${item.type}`);
                    }

                    subtotal += price * item.quantity;

                    if (prepTime > longestPrepTime) {
                        longestPrepTime = prepTime;
                    }

                    itemsToCreate.push({
                        productId: item.productId,
                        productVariantId: item.productVariantId,
                        instructions: item.instructions,
                        menuId: item.menuId,
                        quantity: item.quantity,
                        price: price,
                        type: item.type,
                        status: "pending" as const,
                        estimatedReadyAt: new Date(Date.now() + prepTime * 60 * 1000),
                    });
                }

                subtotal = Math.round(subtotal);

                // Step 4: find the branch, delivery fee and estimated delivery time
                let deliveryFee = 0;
                let estimatedDeliveryTime: Date | null = null;
                let branchId: string ;

                if (data.orderType === "delivery") {
                    const shippingAddress = await tx.shippingAddresses.findUnique({
                        where: { name: data.shippingAddressName },
                        select: { deliveryFee: true, deliveryTime: true, branchId: true },
                    });

                    if (!shippingAddress) {
                        throw new Error("Shipping address not found");
                    }

                    deliveryFee = shippingAddress.deliveryFee;
                    branchId = shippingAddress.branchId;

                    const totalMinutes = longestPrepTime + shippingAddress.deliveryTime;
                    estimatedDeliveryTime = new Date(Date.now() + totalMinutes * 60 * 1000);
                } else if (data.orderType === "dineIn") {
                    const table = await tx.table.findUnique({
                    where: { id: data.tableId },
                    select: { floorId: true , floor: { select: { branchId: true } } },
                });

                    if (!table) {
                    throw new Error("Table not found");
                    }

                    branchId = table.floor.branchId;
                } 
                
                else{
                    // pickup and dineIn both send a branchId
                    if(!data.branchId) {
                        res.status(400).json({ message: "branchId is required for pickup and dineIn orders" });
                        return;
                    }
                    branchId = data.branchId;
                }

                // Step 5: totals (promotions will come later)
                const discount = 0;
                const total = subtotal - discount + deliveryFee;

                // Step 6: create the order ONCE
                const order = await tx.orders.create({
                    data: {
                        branchId: branchId,
                        guestName: data.guestName,
                        guestPhone: data.guestPhone,
                        discount: discount,
                        subtotal: subtotal,
                        total: total,
                        status: "pending",
                        orderType: data.orderType,
                    },
                });

                // Step 7: create the order items
                for (const item of itemsToCreate) {
                    await tx.orderItems.create({
                        data: {
                            orderNumber: order.number,
                            productId: item.productId,
                            productVariantId: item.productVariantId,
                            Instructions: item.instructions,
                            menuId: item.menuId,
                            quantity: item.quantity,
                            price: item.price,
                            type: item.type,
                            status: item.status,
                            estimatedReadyAt: item.estimatedReadyAt,
                        },
                    });
                }

                // Step 8: create the extra row depending on the order type
                if (data.orderType === "delivery") {
                    if (!estimatedDeliveryTime) {
                        throw new Error("Estimated delivery time missing");
                    }
                    await tx.deliveries.create({
                        data: {
                            orderNumber: order.number,
                            shippingAddressName: data.shippingAddressName,
                            status: "pending",
                            estimatedDeliveryTime: estimatedDeliveryTime,
                        },
                    });
                }

                if (data.orderType === "pickup") {
                    await tx.pickupOrders.create({
                        data: {
                            orderNumber: order.number,
                            pickupTime: data.pickupTime,
                        },
                    });
                }

                if (data.orderType === "dineIn") {
                    const table = await tx.table.findUnique({
                        where: { id: data.tableId },
                    });

                    if (!table) {
                        throw new Error("Table not found");
                    }

                    await tx.dineInOrders.create({
                        data: {
                            orderNumber: order.number,
                            tableId: data.tableId,
                        },
                    });
                }

                return order;
            },
            {
                maxWait: 10000,
                timeout: 20000,
            }
        );

        // Step 9: send the result
        res.status(201).json(newOrder);

    } catch (error) {
        console.error("Error placing guest order:", error);
        res.status(500).json({ error: "Failed to place order" });
    }
};

// GET ENDPOINTS

// GET ALL ORDERS FROM YOUR BRANCH ACCORDING TO A STATUS OR ALL ORDERS FROM YOUR BRANCH
export const getOrdersByBranch = async (req: Request, res: Response): Promise<void> => {
    
    if(!req.user || req.user.role === "CUSTOMER") {
        res.status(401).json({message:"Only An employee from Pizzaland Can Access this Endpoint"})
        return;
    }

    const email = req.user.Id
    const result = orderStatusQuerySchema.safeParse(req.query);

     if(!result.data) {
        const fieldErrors = z.flattenError(result.error)
        res.status(400).json({message: " Wrong Input Values" , error: fieldErrors.fieldErrors})
        return;
     }

    const { status } = result.data;

    try {
        const employee = await prisma.employees.findUnique({
            where: { email },
            select: { branchId: true , role: true},  // only need this one field
        });

        if (!employee) {
            res.status(401).json({message:"There is no employee found here"});
            return;
        }

        
        if (!employee.branchId) {
            res.status(400).json({
                error: { message: "Employee is not assigned to a branch"},
            });
            return;
        }

        // Build where dynamically so omitting ?status returns ALL orders
        const where: any = { branchId: employee.branchId };
        if (status) where.status = status;

        const orders = await prisma.orders.findMany({
            where,
            include: fullOrderInclude,
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({ data: orders });
    } catch (error) {
        console.error("getOrdersByBranch failed:", error);
        res.status(500).json({
            error: { message: "Failed to fetch orders", code: "ORDERS_FETCH_FAILED" },
        });
    }
};
// I might later need code for the admin to get all orders

// GET CUSTOMER ORDERS : IF STATUS IS NOT COMPLETED OR A FINAL STATUS THE ORDER
// IS CURRENT OTHERWISE IT WILL BE CONSIDERED AS HISTORY
// Final statuses = history. Everything else = current.
const FINAL_STATUSES = ["successful", "delivered", "cancelled"] as const;

export const getMyOrders = async (req: Request, res: Response): Promise<void> => {
    const phone = req.user.Id;

    if (!phone) {
        res.status(401).json({ error: { message: "Please login", code: "UNAUTHORIZED" } });
        return;
    }

    // Expect ?view=current or ?view=history (default: current)
    const view = req.query.view === "history" ? "history" : "current";

    try {
        const orders = await prisma.orders.findMany({
            where: {
                customerPhone: phone,
                status: view === "history"
                    ? { in: [...FINAL_STATUSES] }
                    : { notIn: [...FINAL_STATUSES] },
            },
            include: fullOrderInclude,
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({ data: orders });
    } catch (error) {
        console.error("getMyOrders failed:", error);
        res.status(500).json({
            error: { message: "Failed to fetch orders", code: "ORDERS_FETCH_FAILED" },
        });
    }
};

// Update Order endpoint
export const updateOrder = async (req: Request, res: Response): Promise<void> => {
    try {
        // Step 1: only staff can update orders
        if (!req.user || req.user.role === "CUSTOMER") {
            res.status(403).json({ error: "Only staff can update orders" });
            return;
        }

        // Step 2: get the order number from the URL
        const number = req.params.number;

        if (typeof number !== "string") {
            res.status(400).json({ error: "Invalid order number" });
            return;
        }

        // Step 3: check the request body
        const result = updateOrderSchema.safeParse(req.body);
        if (!result.success) {
            const fieldErrors = z.flattenError(result.error);
            res.status(400).json({ message: "Wrong Input Values", error: fieldErrors.fieldErrors });
            return;
        }

        const data = result.data;

        // Step 4: reject an update with nothing in it
        if (Object.values(data).every((v) => v === undefined)) {
            res.status(400).json({ error: "No fields provided to update" });
            return;
        }

        // Step 5: find the order
        const existing = await prisma.orders.findUnique({
            where: { number: number },
            select: { orderType: true, subtotal: true, discount: true, total: true },
        });

        if (!existing) {
            res.status(404).json({ error: "Order not found" });
            return;
        }

        // Step 6: the fields the client sent
        const status = data.status;
        const discount = data.discount;
        const employeeEmail = data.employeeEmail;
        const pickupTime = data.pickupTime;
        const tableId = data.tableId;
        const driverEmail = data.driverEmail;
        const estimatedDeliveryTime = data.estimatedDeliveryTime;
        const actualDeliveryTime = data.actualDeliveryTime;
        const deliveryStatus = data.deliveryStatus;

        // Step 7: the fields must match the order type
        if (pickupTime !== undefined && existing.orderType !== "pickup") {
            res.status(400).json({ error: "pickupTime only applies to pickup orders" });
            return;
        }

        if (tableId !== undefined && existing.orderType !== "dineIn") {
            res.status(400).json({ error: "tableId only applies to dine-in orders" });
            return;
        }

        let hasDeliveryField = false;
        if (driverEmail !== undefined) hasDeliveryField = true;
        if (estimatedDeliveryTime !== undefined) hasDeliveryField = true;
        if (actualDeliveryTime !== undefined) hasDeliveryField = true;
        if (deliveryStatus !== undefined) hasDeliveryField = true;

        if (hasDeliveryField && existing.orderType !== "delivery") {
            res.status(400).json({ error: "Delivery fields only apply to delivery orders" });
            return;
        }

        // Step 8: check that the employee, driver and table exist
        if (employeeEmail !== undefined) {
            const employee = await prisma.employees.findUnique({
                where: { email: employeeEmail },
            });
            if (!employee) {
                res.status(404).json({ error: "Employee not found" });
                return;
            }
        }

        if (driverEmail !== undefined) {
            const driver = await prisma.employees.findUnique({
                where: { email: driverEmail },
            });
            if (!driver) {
                res.status(404).json({ error: "Driver not found" });
                return;
            }
            if (driver.role !== "DELIVERY_DRIVER") {
                res.status(400).json({ error: "This employee is not a delivery driver" });
                return;
            }
        }

        if (tableId !== undefined) {
            const table = await prisma.table.findUnique({
                where: { id: tableId },
            });
            if (!table) {
                res.status(404).json({ error: "Table not found" });
                return;
            }
        }

        // Step 9: if there is a new discount, work out the new total
        // total = subtotal - discount + delivery fee
        // so we give back the old discount and take off the new one
        let newTotal: number | undefined = undefined;

        if (discount !== undefined) {
            if (discount > existing.subtotal) {
                res.status(400).json({ error: "Discount cannot be more than the subtotal" });
                return;
            }
            newTotal = Math.round(existing.total + existing.discount - discount);
        }

        // Step 10: save everything in one transaction
        // Fields that are undefined are ignored by Prisma, so they stay unchanged
        const order = await prisma.$transaction(
            async (tx) => {

                // Update the main order
                if (status !== undefined || discount !== undefined || employeeEmail !== undefined) {
                    await tx.orders.update({
                        where: { number: number },
                        data: {
                            status: status,
                            discount: discount,
                            total: newTotal,
                            employeeEmail: employeeEmail,
                        },
                    });
                }

                // Update the pickup row
                if (pickupTime !== undefined) {
                    await tx.pickupOrders.updateMany({
                        where: { orderNumber: number },
                        data: { pickupTime: pickupTime },
                    });
                }

                // Update the dine-in row
                if (tableId !== undefined) {
                    await tx.dineInOrders.updateMany({
                        where: { orderNumber: number },
                        data: { tableId: tableId },
                    });
                }

                // Update the delivery row
                if (hasDeliveryField) {
                    await tx.deliveries.updateMany({
                        where: { orderNumber: number },
                        data: {
                            driverEmail: driverEmail,
                            estimatedDeliveryTime: estimatedDeliveryTime,
                            actualDeliveryTime: actualDeliveryTime,
                            status: deliveryStatus,
                        },
                    });
                }

                // Return the full updated order
                return tx.orders.findUniqueOrThrow({
                    where: { number: number },
                    include: fullOrderInclude,
                });
            },
            {
                maxWait: 10000,
                timeout: 20000,
            }
        );

        // Step 11: send the result
        res.status(200).json({ data: order });

    } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).json({ error: "Failed to update order" });
    }
};

export const updateOrderStatus = async (req: Request, res: Response): Promise<void> => {
    try{
         const result = orderStatusQuerySchema.safeParse(req.query);

         if(!result.data) {
            const fieldErrors = z.flattenError(result.error)
            res.status(400).json({message: " Wrong Input Values" , error: fieldErrors.fieldErrors})
            return;
         }

         const { status } = result.data;

         const number = req.params.number;

            if (typeof number !== "string") {
                res.status(400).json({ error: "Invalid order number" });
                return;
            }

        const updatedOrder = await prisma.orders.update({
            where: { number },
            data: { status },
            include: fullOrderInclude,
        });

        res.status(200).json({ data: updatedOrder });

    }catch (error) {
        res.status(500).json({ error: "Failed to update order status" });
        console.log("Error updating order status:", error);
    };
};

// DELETE orders : DANGEROUS

export const deleteOrders = async (req: Request, res: Response): Promise<void> => {
    const result = deleteOrderSchema.safeParse(req.body);


      if(!result.data) {
        const fieldErrors = z.flattenError(result.error)
        res.status(400).json({message: " Wrong Input Values" , error: fieldErrors.fieldErrors})
        return;
     }

    const { numbers } = result.data;

    try {
        const deleted = await prisma.orders.deleteMany({
            where: { number: { in: numbers } },
        });

        if (deleted.count === 0) {
            res.status(404).json({
                error: { message: "No matching orders found", code: "NOT_FOUND" },
            });
            return;
        }

        res.status(200).json({
            data: {
                message: `${deleted.count} order(s) deleted`,
                deleted: numbers,
            },
        });
    } catch (err) {
        console.error("deleteOrders failed:", err);
        res.status(500).json({
            error: { message: "Failed to delete orders", code: "ORDER_DELETE_FAILED" },
        });
    }
};

// For Chefs to Dispatch Orders
export const dispatchOrder = async (req: Request, res: Response) => {
    try {
        const orderNumber = req.params.number as string;

        if (!orderNumber) {
            res.status(400).json({ error: { message: "Order number is required" } });
            return;
        }

        const order = await prisma.orders.findUnique({
            where: { number: orderNumber },
        });

        if (!order) {
            res.status(404).json({ error: { message: "Order does not exist" } });
            return;
        }

        if (order.status !== "pending") {
            res.status(400).json({ error: { message: "Order is already dispatched" } });
            return;
        }

        // One transaction: update order + all its items
        await prisma.$transaction(async (tx) => {
            await tx.orders.update({
                where: { number: orderNumber },
                data: { status: "preparing" },
            });

            await tx.orderItems.updateMany({
                where: { orderNumber: orderNumber },
                data: { status: "in_station" },
            });
        });

        res.status(200).json({ data: { message: "Order dispatched to stations" } });
        return;

    } catch (error) {
        console.error("Error dispatching order:", error);
        res.status(500).json({ error: { message: "Failed to dispatch order" } });
        return;
    }
};

//This is for the Station to find their dispatched Order Item
export const getStationOrders = async (req: Request, res: Response) => {
    try {
        const stationId = req.params.stationId as string;

        if (!stationId) {
            res.status(400).json({ error: { message: "Station id is required" } });
            return;
        }

        // Find all orders that are in the kitchen
        const kitchenOrders = await prisma.orders.findMany({
            where: { status: "preparing" },
            include: {
                customer: true,
                items: {
                    include: {
                        product: true,
                        productVariant: { select: { name: true } },
                        addons: true,
                        menu: true
                    }
                }
            }
        });

        const stationTickets = [];

        for (let order of kitchenOrders) {
            const stationItems: any[] = [];

            for (let item of order.items) {

                // ── Product ──
                if (item.type === "product") {
                    if (!item.productId) continue;

                    const product = await prisma.products.findUnique({
                        where: { id: item.productId },
                        include: { station: true, addons: true }
                    });

                    if (!product || !product.station) continue;
                    if (product.station.id !== stationId) continue;

                    const addonIds = product.addons.map(addon => addon.id);
                    const matchedAddons = order.items.filter(
                        orderItem => orderItem.addonId !== null && addonIds.includes(orderItem.addonId)
                    );

                    stationItems.push({
                        itemId: product.id,
                        itemName: product.name,
                        itemVariant: item.productVariant?.name,
                        itemType: "product",
                        quantity: item.quantity,
                        addons: matchedAddons
                    });
                }

                // ── Menu ──
                if (item.type === "menu") {
                    if (!item.menuId) continue;

                    const menu = await prisma.menu.findUnique({
                        where: { id: item.menuId },
                        include: {
                            items: {
                                include: {
                                    product: { select: { name: true, stationId: true } }
                                }
                            }
                        }
                    });

                    if (!menu) continue;

                    for (const menuItem of menu.items) {
                        if (menuItem.product.stationId === stationId) {
                            stationItems.push({
                                itemId: menuItem.id,
                                itemName: menuItem.product.name,
                                itemType: "menu",
                                menuName: menu.name,
                                quantity: item.quantity * menuItem.quantity
                            });
                        }
                    }
                }
            }

            // Only include this order if it has items for this station
            if (stationItems.length > 0) {
                stationTickets.push({
                    orderNumber: order.number,
                    items: stationItems
                });
            }
        }

        res.status(200).json({ data: stationTickets });
        return;

    } catch (error) {
        console.error("Error getting station orders:", error);
        res.status(500).json({ error: { message: "Failed to get station orders" } });
        return;
    }
};


// Send them back to the kitchen station 
export const updateOrderItemStatus = async (req: Request, res: Response) => {
    try {
        const itemId = req.params.itemId as string;

        if (!itemId) {
            res.status(400).json({ error: { message: "Item id is required" } });
            return;
        }

        // Step 1: find the item
        const item = await prisma.orderItems.findUnique({
            where: { id: itemId },
        });

        if (!item) {
            res.status(404).json({ error: { message: "Order item not found" } });
            return;
        }

        if (item.status !== "in_station") {
            res.status(400).json({ error: { message: "Item is not in station" } });
            return;
        }

        // Step 2: mark this item as ready
        await prisma.orderItems.update({
            where: { id: itemId },
            data: { status: "ready" },
        });

        // Step 3: check if ALL items in this order are now ready
        const remainingItems = await prisma.orderItems.findMany({
            where: {
                orderNumber: item.orderNumber,
                status: { not: "ready" },
            },
        });

        // Step 4: if nothing is left, mark the order as ready
        if (remainingItems.length === 0) {
            await prisma.orders.update({
                where: { number: item.orderNumber },
                data: { status: "ready" },
            });
        }

        res.status(200).json({
            data: {
                message: "Item marked as ready",
                orderReady: remainingItems.length === 0,
            },
        });
        return;

    } catch (error) {
        console.error("Error marking item ready:", error);
        res.status(500).json({ error: { message: "Failed to mark item ready" } });
        return;
    }
};