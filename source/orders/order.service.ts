
import { prisma } from "../lib/prisma";
import { Request, Response } from "express";
import { createOrderSchema , orderStatusQuerySchema , statusEnum } from "./order.schema";

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
                        driverEmail: data.driverEmail,
                        shippingAddressName: data.shippingAddressName,
                        estimatedDeliveryTime: data.estimatedDeliveryTime,
                        status: "pending",
                    },
                });
            }

            return newOrder;
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

// GET ALL ORDERS FROM YOUR BRANCH ACCORDING TO A STATUS
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
            include: {
                // ── Customer info ──
                customer: {
                    select: { phone: true, firstName: true, lastName: true },
                },

                // ── Order items with product/menu names ──
                items: {
                    include: {
                        product: { select: { id: true, name: true, price: true } },
                        menu:    { select: { id: true, name: true, price: true } },
                    },
                },

                // ── Type-specific details ──
                pickupOrders: true,
                dineInOrders: true,
                deliveries: {
                    include: {
                        // This is where the delivery fee lives
                        shippingAddress: {
                            select: {
                                name: true,
                                region: true,
                                city: true,
                                neighborhood: true,
                                deliveryFee: true,
                                deliveryTime: true,
                            },
                        },
                        // Driver info
                        driver: {
                            select: { email: true, firstName: true, lastName: true, phone: true },
                        },
                    },
                },

                // ── Payment status ──
                Payments: {
                    select: { id: true, amount: true, method: true, status: true },
                },
            },
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