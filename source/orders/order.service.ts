
import { prisma } from "../lib/prisma";
import { Request, Response } from "express";
import { createOrderSchema , orderStatusQuerySchema , statusEnum , updateOrderSchema , deleteOrderSchema , markItemStatusSchema} from "./order.schema";
import { fullOrderInclude } from "./order.include";
// CREATE ENDPOINTS

// MAIN FUNCTION TO CREATE AN ENDPOINT
export const createOrder = async (req: Request, res: Response): Promise<void> => {
    // ── 1. Validate everything in one shot ──
    const result = createOrderSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            error: {
                message: "Validation failed",
                code: "VALIDATION_ERROR",
                details: result.error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                })),
            },
        });
        return;
    }

    const data = result.data;

    try {
        const order = await prisma.$transaction(async (tx) => {

             // ── Derive branchId based on order type ──
            let branchId: string;

            if (data.orderType === "delivery") {
                // Shipping address belongs to exactly one branch
                const address = await tx.shippingAddresses.findUnique({
                    where: { name: data.shippingAddressName },
                    select: { branchId: true },
                });
                if (!address) {
                    throw new Error(`Shipping address "${data.shippingAddressName}" not found`);
                }
                branchId = address.branchId;

            } else {
                // dineIn or pickup — cashier is at the branch
                const employee = await tx.employees.findUnique({
                    where: { email: req.user!.userId },
                    select: { branchId: true },
                });
                if (!employee?.branchId) {
                    throw new Error("You are not assigned to any branch");
                }
                branchId = employee.branchId;
            }

            // ── 2. Look up prices server-side (never trust client) ──
            const productIds = data.items
                .filter((i) => i.type === "product" && i.productId)
                .map((i) => i.productId!);

            const menuIds = data.items
                .filter((i) => i.type === "menu" && i.menuId)
                .map((i) => i.menuId!);

            const [products, menus] = await Promise.all([
                productIds.length
                    ? tx.products.findMany({ where: { id: { in: productIds } } })
                    : [],
                menuIds.length
                    ? tx.menu.findMany({ where: { id: { in: menuIds } } })
                    : [],
            ]);

            const productPriceMap = new Map(products.map((p) => [p.id, p.price]));
            const menuPriceMap = new Map(menus.map((m) => [m.id, m.price]));

            // ── 3. Build order items with server-derived prices ──
            const orderItems = data.items.map((item) => {
                let price: number;

                if (item.type === "product") {
                    price = productPriceMap.get(item.productId!) ?? 0;
                    if (!price) throw new Error(`Product ${item.productId} not found`);
                } else if (item.type === "menu") {
                    price = menuPriceMap.get(item.menuId!) ?? 0;
                    if (!price) throw new Error(`Menu ${item.menuId} not found`);
                } else {
                    // addons — you'll need addon price lookup later
                    throw new Error("Addon pricing not implemented yet");
                }

                return {
                    productId: item.productId ?? null,
                    menuId: item.menuId ?? null,
                    quantity: item.quantity,
                    price,
                    type: item.type,
                    status: "pending" as const,
                    estimatedReadyAt: new Date(), // TODO: compute from product.preparationTime
                };
            });

            // ── 4. Compute totals ──
            const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
            const discount = 0; // TODO: compute from promotions
            const total = subtotal - discount;

            // ── 5. Create the order ──
            const newOrder = await tx.orders.create({
                data: {
                    branchId,
                    cashierEmail: data.cashierEmail,
                    customerPhone: data.customerPhone,
                    employeeEmail: data.employeeEmail,
                    discount,
                    subtotal,
                    total,
                    orderType: data.orderType,
                    status: "pending",
                },
            });

            // ── 6. Create order items ──
            await tx.orderItems.createMany({
                data: orderItems.map((item) => ({
                    ...item,
                    orderNumber: newOrder.number,
                })),
            });

            // ── 7. Create type-specific record ──
            if (data.orderType === "pickup") {
                await tx.pickupOrders.create({
                    data: {
                        orderNumber: newOrder.number,
                        pickupTime: data.pickupTime,
                    },
                });
            } else if (data.orderType === "dineIn") {
                await tx.dineInOrders.create({
                    data: {
                        orderNumber: newOrder.number,
                        table: data.table,
                    },
                });
            } else if (data.orderType === "delivery") {
                await tx.deliveries.create({
                    data: {
                        orderNumber: newOrder.number,
                        shippingAddressName: data.shippingAddressName,
                        estimatedDeliveryTime: data.estimatedDeliveryTime,
                        status: "pending",
                    },
                });
            }

        return tx.orders.findUniqueOrThrow({
            where: { number: newOrder.number },
            include: fullOrderInclude,
        });
    
        });

        res.status(201).json({ data: order });
    } catch (err: any) {
        console.error("createOrder transaction failed:", err);

        // Surface "not found" errors as 400, not 500
        if (err.message?.includes("not found")) {
            res.status(400).json({
                error: { message: err.message, code: "INVALID_ITEM" },
            });
            return;
        }

        res.status(500).json({
            error: { message: "Failed to create order", code: "ORDER_CREATE_FAILED" },
        });
    }
};
// GET ENDPOINTS

// GET ALL ORDERS FROM YOUR BRANCH ACCORDING TO A STATUS OR ALL ORDERS FROM YOUR BRANCH
export const getOrdersByBranch = async (req: Request, res: Response): Promise<void> => {
    const email = req.user?.userId;
    const result = orderStatusQuerySchema.safeParse(req.query);

    if (!result.success) {
        res.status(400).json({ error: result.error }); // 400 not 403 — it's a validation error
        return;
    }

    const { status } = result.data;

    try {
        const employee = await prisma.employees.findUnique({
            where: { email },
            select: { branchId: true },  // only need this one field
        });

        if (!employee) {
            res.status(401).json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
            return;
        }

        if (!employee.branchId) {
            res.status(400).json({
                error: { message: "Employee is not assigned to a branch", code: "NO_BRANCH_ASSIGNED" },
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
    const phone = req.user?.userId;

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



// UPDATE ENDPOINT :
export const updateOrder = async (req: Request, res: Response): Promise<void> => {
    const result = updateOrderSchema.safeParse(req.body);

    const number = req.params.number;

   if (typeof number !== "string") {
    res.status(400).json({ error: { message: "Invalid order number", code: "INVALID_PARAM" } });
    return;
  }

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

    const data = result.data;

    // Reject empty updates
    if (Object.values(data).every((v) => v === undefined)) {
        res.status(400).json({
            error: { message: "No fields provided to update", code: "EMPTY_UPDATE" },
        });
        return;
    }

    try {
        const order = await prisma.$transaction(async (tx) => {
            // ── 1. Verify order exists and get its type ──
            const existing = await tx.orders.findUnique({
                where: { number },
                select: { orderType: true },
            });

            if (!existing) {
                throw new Error("Order not found");
            }

            // ── 2. Separate base fields from nested fields ──
            const { pickupTime, table, driverEmail, estimatedDeliveryTime,
                    actualDeliveryTime, deliveryStatus, ...baseFields } = data;

            // ── 3. Update base order (only if there are base fields) ──
            if (Object.values(baseFields).some((v) => v !== undefined)) {
                await tx.orders.update({
                    where: { number },
                    data: baseFields,
                });
            }

            // ── 4. Update type-specific record ──
            if (existing.orderType === "pickup" && pickupTime !== undefined) {
                await tx.pickupOrders.updateMany({
                    where: { orderNumber: number },
                    data: { pickupTime },
                });
            }

            if (existing.orderType === "dineIn" && table !== undefined) {
                await tx.dineInOrders.updateMany({
                    where: { orderNumber: number },
                    data: { table },
                });
            }

            if (existing.orderType === "delivery") {
                // Build delivery update dynamically (same pattern as where)
                const deliveryUpdate: any = {};
                if (driverEmail !== undefined)           deliveryUpdate.driverEmail = driverEmail;
                if (estimatedDeliveryTime !== undefined)  deliveryUpdate.estimatedDeliveryTime = estimatedDeliveryTime;
                if (actualDeliveryTime !== undefined)     deliveryUpdate.actualDeliveryTime = actualDeliveryTime;
                if (deliveryStatus !== undefined)         deliveryUpdate.status = deliveryStatus;

                if (Object.keys(deliveryUpdate).length > 0) {
                    await tx.deliveries.updateMany({
                        where: { orderNumber: number },
                        data: deliveryUpdate,
                    });
                }
            }

            // ── 5. Return full updated order ──
            return tx.orders.findUniqueOrThrow({
                where: { number },
                include: fullOrderInclude,
            });
        });

        res.status(200).json({ data: order });
    } catch (err: any) {
        console.error("updateOrder failed:", err);

        if (err.message === "Order not found") {
            res.status(404).json({ error: { message: "Order not found", code: "NOT_FOUND" } });
            return;
        }
        res.status(500).json({
            error: { message: "Failed to update order", code: "ORDER_UPDATE_FAILED" },
        });
    }
};


// DELETE orders : DANGEROUS

export const deleteOrders = async (req: Request, res: Response): Promise<void> => {
    const result = deleteOrderSchema.safeParse(req.body);

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
        await prisma.$transaction(async (tx) => {
            await tx.orders.update({
                where: { number },
                data: { status: "kitchen" },
            });

            await tx.orderItems.updateMany({
                where: { orderNumber: number },
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

        if (err.message?.includes("no station")) {
            res.status(400).json({ error: { message: err.message, code: "MISSING_STATION" } });
            return;
        }
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
        res.status(400).json({ error: result.error });
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

                await tx.orders.update({
                    where: { number: item.orderNumber },
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