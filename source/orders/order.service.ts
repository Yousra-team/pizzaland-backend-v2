
import { prisma } from "../lib/prisma";
import { Request, Response } from "express";
import { createOrderSchema , orderStatusQuerySchema , statusEnum , updateOrderSchema , deleteOrderSchema , markItemStatusSchema} from "./order.schema";
import { fullOrderInclude } from "./order.include";

// An error we throw on purpose (bad input, wrong order state), carrying the HTTP status
// and code to answer with. Anything else that fails is a real 500.
class OrderError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

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
    const user = req.user!;
    const isCustomer = user.role === "CUSTOMER";

    try {
        const order = await prisma.$transaction(async (tx) => {

            // ── 2. Who is the customer? ──
            // Customers order for themselves (phone from the token). Staff enter the
            // customer's phone, or leave it out for a walk-in customer.
            const customerPhone = isCustomer ? user.userId : data.customerPhone;

            if (!customerPhone && data.orderType === "delivery") {
                throw new OrderError("A customer phone is required for delivery orders", 400, "CUSTOMER_REQUIRED");
            }
            if (!isCustomer && customerPhone) {
                const customer = await tx.customers.findUnique({
                    where: { phone: customerPhone },
                    select: { phone: true },
                });
                if (!customer) {
                    throw new OrderError(`Customer ${customerPhone} not found`, 400, "CUSTOMER_NOT_FOUND");
                }
            }

            // ── 3. Derive branchId (+ delivery fee and time for deliveries) ──
            let branchId: string;
            let deliveryFee = 0;
            let deliveryTime = 0; // minutes

            if (data.orderType === "delivery") {
                // Shipping address belongs to exactly one branch
                const address = await tx.shippingAddresses.findUnique({
                    where: { name: data.shippingAddressName },
                    select: { branchId: true, deliveryFee: true, deliveryTime: true },
                });
                if (!address) {
                    throw new OrderError(`Shipping address "${data.shippingAddressName}" not found`, 400, "ADDRESS_NOT_FOUND");
                }
                branchId = address.branchId;
                deliveryFee = address.deliveryFee;
                deliveryTime = address.deliveryTime;

            } else if (isCustomer) {
                // dineIn or pickup by a customer — the branch they selected
                if (!data.branchId) {
                    throw new OrderError("Please select a branch", 400, "BRANCH_REQUIRED");
                }
                const branch = await tx.branches.findUnique({
                    where: { id: data.branchId },
                    select: { id: true },
                });
                if (!branch) {
                    throw new OrderError("Branch not found", 400, "BRANCH_NOT_FOUND");
                }
                branchId = branch.id;

            } else {
                // dineIn or pickup by staff — the employee's own branch
                const employee = await tx.employees.findUnique({
                    where: { email: user.userId },
                    select: { branchId: true },
                });
                if (!employee?.branchId) {
                    throw new OrderError("You are not assigned to any branch", 403, "NO_BRANCH");
                }
                branchId = employee.branchId;
            }

            // ── 4. Look up prices server-side (never trust client) ──
            const productIds = data.items
                .filter((i) => i.type === "product" && i.productId)
                .map((i) => i.productId!);

            const menuIds = data.items
                .filter((i) => i.type === "menu" && i.menuId)
                .map((i) => i.menuId!);

            const addonIds = data.items
                .filter((i) => i.type === "addons" && i.addonId)
                .map((i) => i.addonId!);

            const [products, menus, addons] = await Promise.all([
                productIds.length
                    ? tx.products.findMany({
                        where: { id: { in: productIds } },
                        select: { id: true, name: true, price: true, variants: { select: { id: true, price: true } } },
                    })
                    : [],
                menuIds.length
                    ? tx.menu.findMany({ where: { id: { in: menuIds } } })
                    : [],
                addonIds.length
                    ? tx.addons.findMany({ where: { id: { in: addonIds } } })
                    : [],
            ]);

            const productMap = new Map(products.map((p) => [p.id, p]));
            const menuPriceMap = new Map(menus.map((m) => [m.id, m.price]));
            const addonPriceMap = new Map(addons.map((a) => [a.id, a.price]));

            // ── 5. Build order items with server-derived prices ──
            const orderItems = data.items.map((item) => {
                let price: number;
                let productVariantId: string | null = null;

                if (item.type === "product") {
                    const product = productMap.get(item.productId!);
                    if (!product) throw new OrderError(`Product ${item.productId} not found`, 400, "INVALID_ITEM");

                    if (product.variants.length === 0) {
                        // No variants: base price
                        price = product.price;
                    } else {
                        // Has variants: the customer must choose one, and pays its price
                        const variant = product.variants.find((v) => v.id === item.productVariantId);
                        if (!variant) throw new OrderError(`Please choose a valid variant for "${product.name}"`, 400, "INVALID_VARIANT");
                        price = variant.price;
                        productVariantId = variant.id;
                    }
                } else if (item.type === "menu") {
                    const menuPrice = menuPriceMap.get(item.menuId!);
                    if (menuPrice === undefined) throw new OrderError(`Menu ${item.menuId} not found`, 400, "INVALID_ITEM");
                    price = menuPrice;
                } else {
                    const addonPrice = addonPriceMap.get(item.addonId!);
                    if (addonPrice === undefined) throw new OrderError(`Addon ${item.addonId} not found`, 400, "INVALID_ITEM");
                    price = addonPrice;
                }

                return {
                    productId: item.type === "product" ? item.productId! : null,
                    productVariantId,
                    menuId: item.type === "menu" ? item.menuId! : null,
                    addonId: item.type === "addons" ? item.addonId! : null,
                    quantity: item.quantity,
                    price,
                    type: item.type,
                    status: "pending" as const,
                    estimatedReadyAt: new Date(), // TODO: compute from product.preparationTime
                };
            });

            // ── 6. Compute totals ──
            const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
            const discount = 0; // TODO: compute from promotions
            const total = subtotal - discount + deliveryFee; // deliveryFee is 0 for pickup / dine-in

            // ── 7. Create the order ──
            // Staff who create the order are recorded from their token: cashiers as
            // cashierEmail, any other employee (e.g. a waiter) as employeeEmail
            const newOrder = await tx.orders.create({
                data: {
                    branchId,
                    customerPhone, // undefined = walk-in customer
                    cashierEmail: user.role === "CASHIER" ? user.userId : undefined,
                    employeeEmail: !isCustomer && user.role !== "CASHIER" ? user.userId : undefined,
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
                        // now + the address's delivery time (minutes)
                        estimatedDeliveryTime: new Date(Date.now() + deliveryTime * 60 * 1000),
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

        if (err instanceof OrderError) {
            res.status(err.status).json({ error: { message: err.message, code: err.code } });
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
                select: { orderType: true, subtotal: true, discount: true, total: true },
            });

            if (!existing) {
                throw new Error("Order not found");
            }

            // ── 2. Separate base fields from nested fields ──
            const { pickupTime, table, driverEmail, estimatedDeliveryTime,
                    actualDeliveryTime, deliveryStatus, ...baseFields } = data;

            // ── Discount: between 0 (checked by the schema) and the subtotal, and the
            //    total follows it. total = subtotal - discount + delivery fee, so we
            //    give back the old discount and take off the new one (the fee is kept).
            let totalUpdate = {};
            if (baseFields.discount !== undefined) {
                if (baseFields.discount > existing.subtotal) {
                    throw new OrderError("Discount cannot be more than the subtotal", 400, "INVALID_DISCOUNT");
                }
                totalUpdate = { total: existing.total + existing.discount - baseFields.discount };
            }

            // ── 3. Update base order (only if there are base fields) ──
            if (Object.values(baseFields).some((v) => v !== undefined)) {
                await tx.orders.update({
                    where: { number },
                    data: { ...baseFields, ...totalUpdate },
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

        if (err instanceof OrderError) {
            res.status(err.status).json({ error: { message: err.message, code: err.code } });
            return;
        }
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
        // Only a new order can be dispatched. The status check is inside the update itself:
        // dispatching twice, or a cancelled/finished order, would otherwise send it back to
        // "kitchen" and reset items that are already ready.
        await prisma.$transaction(async (tx) => {
            const updated = await tx.orders.updateMany({
                where: { number, status: { in: ["pending", "confirmed"] } },
                data: { status: "kitchen" },
            });
            if (updated.count === 0) {
                throw new OrderError(`Order cannot be dispatched while it is "${order.status}"`, 409, "INVALID_STATUS");
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

        if (err instanceof OrderError) {
            res.status(err.status).json({ error: { message: err.message, code: err.code } });
            return;
        }
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