
import { prisma } from "../lib/prisma.js";
import { Request, Response } from "express";
import { createOrderSchema , orderStatusQuerySchema , statusEnum , updateOrderSchema , deleteOrderSchema , markItemStatusSchema} from "./order.schema.js";
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
                    menuId: item.menuId,
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
            select: { branchId: true },  // only need this one field
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

// For Kitchen stations 

//This is for the Chef to mark their order as dispatched
export const dispatchOrder = async (req: Request, res: Response): Promise<void> => {
    const number = req.params.number;

    if (typeof number !== "string") {
        res.status(400).json({ error: { message: "Invalid order number", code: "INVALID_PARAM" } });
        return;
    }

    try {
        // ── 1. Fetch order items with full product/menu chain ──
        const order = await prisma.orders.findUnique({
            where: { number },
            select: {
                number: true,
                status: true,
                branchId: true,
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                stationId: true,
                                station: { select: { id: true, name: true } },
                            },
                        },
                        menu: {
                            select: {
                                id: true,
                                name: true,
                                items: {
                                    include: {
                                        product: {
                                            select: {
                                                id: true,
                                                name: true,
                                                stationId: true,
                                                station: { select: { id: true, name: true } },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!order) {
            res.status(404).json({ error: { message: "Order not found", code: "NOT_FOUND" } });
            return;
        }

        // ── 2. Resolve every item to station assignments ──
        // Each entry = one thing a station needs to prepare
        const stationTasks: {
            stationId: string;
            stationName: string;
            orderItemId: string;
            productId: string;
            productName: string;
            quantity: number;
            source: "product" | "menu";
            menuName?: string;
        }[] = [];

        for (const item of order.items) {
            if (item.type === "product" && item.product) {
                // Direct product → direct station
                if (!item.product.station) {
                    throw new Error(`Product "${item.product.name}" has no station assigned`);
                }
                stationTasks.push({
                    stationId: item.product.station.id,
                    stationName: item.product.station.name,
                    orderItemId: item.id,
                    productId: item.product.id,
                    productName: item.product.name,
                    quantity: item.quantity,
                    source: "product",
                });

            } else if (item.type === "menu" && item.menu) {
                // Menu → MenuItems → each product goes to its own station
                for (const menuItem of item.menu.items) {
                    if (!menuItem.product.station) {
                        throw new Error(`Product "${menuItem.product.name}" in menu "${item.menu.name}" has no station`);
                    }
                    stationTasks.push({
                        stationId: menuItem.product.station.id,
                        stationName: menuItem.product.station.name,
                        orderItemId: item.id,
                        productId: menuItem.product.id,
                        productName: menuItem.product.name,
                        // Menu quantity × product quantity inside the menu
                        quantity: item.quantity * menuItem.quantity,
                        source: "menu",
                        menuName: item.menu.name,
                    });
                }
            }
        }

        // ── 3. Group by station ──
        const stationMap = new Map<string, {
            stationId: string;
            stationName: string;
            tasks: typeof stationTasks;
        }>();

        for (const task of stationTasks) {
            if (!stationMap.has(task.stationId)) {
                stationMap.set(task.stationId, {
                    stationId: task.stationId,
                    stationName: task.stationName,
                    tasks: [],
                });
            }
            stationMap.get(task.stationId)!.tasks.push(task);
        }

        // ── 4. Update order + item statuses ──
        // Only a new order can be dispatched. The status check is inside the update itself:
        // dispatching twice, or a cancelled/finished order, would otherwise send it back to
        // "kitchen" and reset items that are already ready.
        await prisma.$transaction(async (tx) => {
            const updated = await tx.orders.updateMany({
                where: { number, status: { in: ["pending", "confirmed"] } },
                data: { status: "kitchen" },
            });
            if (updated.count === 0) {
                throw new Error (`Order cannot be dispatched while it is "${order.status}"`);
            }

            await tx.orderItems.updateMany({
                where: { orderNumber: number, status: "pending" },
                data: { status: "in_station" },
            });
        });

        // ── 5. Return grouped dispatch ──
        res.status(200).json({
            data: {
                orderNumber: order.number,
                stations: Array.from(stationMap.values()),
            },
        });

    } catch (err: any) {
        console.error("dispatchOrder failed:", err);
        res.status(500).json({
            error: { message: "Failed to dispatch order", code: "DISPATCH_FAILED" },
        });
    }
};

// Send them back to the kitchen station 

export const updateOrderItemStatus = async (req: Request, res: Response): Promise<void> => {
    const itemId = req.params.itemId;

    if (typeof itemId !== "string") {
        res.status(400).json({ error: { message: "Invalid item id", code: "INVALID_PARAM" } });
        return;
    }

    const result = markItemStatusSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            error: {
                message: "Validation failed",
                code: "VALIDATION_ERROR",
                details: result.error.issues.map((i) => ({
                    field: i.path.join("."),
                    message: i.message,
                })),
            },
        });
        return;
    }

    const { status } = result.data;

    try {
        const updated = await prisma.$transaction(async (tx) => {
            // ── 1. Update the item ──
            const item = await tx.orderItems.update({
                where: { id: itemId },
                data: { status },
                select: { orderNumber: true },
            });

            // ── 2. Check if ALL items in the order are ready ──
            const siblings = await tx.orderItems.findMany({
                where: { orderNumber: item.orderNumber },
                select: { status: true },
            });

            const allReady = siblings.every(
                (s) => s.status === "ready" || s.status === "complete"
            );

            // ── 3. If yes, promote the order status ──
            if (allReady) {
                // Look up order type to pick the right next status
                const order = await tx.orders.findUnique({
                    where: { number: item.orderNumber },
                    select: { orderType: true },
                });

                const nextStatus =
                    order?.orderType === "delivery" ? "ready_for_delivery" : "ready";

                // Only promote an order that is still being prepared: an order already
                // ready, out for delivery, delivered or cancelled must never move back
                await tx.orders.updateMany({
                    where: {
                        number: item.orderNumber,
                        status: { in: ["pending", "confirmed", "kitchen", "preparing"] },
                    },
                    data: { status: nextStatus },
                });
            }

            // ── 4. Return the full updated order ──
            return tx.orders.findUniqueOrThrow({
                where: { number: item.orderNumber },
                include: fullOrderInclude,
            });
        });

        res.status(200).json({ data: updated });
    } catch (err: any) {
        console.error("updateOrderItemStatus failed:", err);

        if (err.code === "P2025") {
            res.status(404).json({ error: { message: "Item not found", code: "NOT_FOUND" } });
            return;
        }
        res.status(500).json({
            error: { message: "Failed to update item", code: "ITEM_UPDATE_FAILED" },
        });
    }
};