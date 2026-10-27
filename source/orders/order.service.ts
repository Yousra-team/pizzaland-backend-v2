import { prisma } from "../lib/prisma.js";
import { Request, Response } from "express";
import { createOrderSchema , orderStatusQuerySchema , statusEnum , orderItemSchema, updateOrderSchema , deleteOrderSchema , markItemStatusSchema} from "./order.schema.js";
import { fullOrderInclude } from "./order.include.js";
import * as z from "zod";
import { creditAccount , convertToYousraCoins } from "../crm/account.js";
import { CreateIdentifier } from "../utilities/counter.js";
import { sendOrderReceiptFR } from "../notifications/index.js";
import { DateTime } from "luxon";


// Helper Functions
class HttpError extends Error {
    // code is an optional short machine-readable tag (e.g. "INVALID_VARIANT")
    constructor(public status: number, message: string, public code?: string) {
        super(message);
    }
}

// Write one row in the order's status-change audit log.
// id has no default in the schema, so we always generate one.
async function recordStatusChange(
    tx: any,
    orderNumber: string,
    fromStatus: string | null,
    toStatus: string,
    changedByEmail: string | null,
) {
    const historyId = await CreateIdentifier("OSH");
    if (!historyId) throw new HttpError(500, "Could not create history identifier");

    await tx.orderStatusHistory.create({
        data: {
            id: historyId,
            orderNumber,
            fromStatus,
            toStatus,
            changedByEmail,
        },
    });
}

// Send the French WhatsApp receipt for an order. Runs AFTER the order is saved and
// is fire-and-forget: a notification problem must never fail or delay the order.
async function sendOrderReceipt(orderNumber: string) {
    try {
        const order = await prisma.orders.findUnique({
            where: { number: orderNumber },
            include: {
                customer: { select: { phone: true, firstName: true } },
                items: {
                    include: {
                        product: { select: { name: true } },
                        productVariant: { select: { name: true } },
                        menu: { select: { name: true } },
                        addons: { select: { name: true } },
                    },
                },
                deliveries: { select: { shippingAddressName: true } },
            },
        });
        if (!order) return;

        // Who to send to: the registered customer, otherwise the guest. No phone → nothing to send.
        const to = order.customer?.phone ?? order.guestPhone;
        if (!to) return;

        const customerName = order.customer?.firstName ?? order.guestName ?? "Client";

        // Build the item list. WhatsApp template values cannot contain newlines, so we join with " | ".
        const lines: string[] = [];
        for (const item of order.items) {
            const name = item.product?.name ?? item.menu?.name ?? item.addons?.name ?? "Article";
            const variant = item.productVariant?.name ? ` (${item.productVariant.name})` : "";
            lines.push(`${item.quantity}x ${name}${variant}`);
        }
        const itemsList = lines.join(" | ");

        const deliveryFee = order.total - order.subtotal + order.discount;
        const address =
            order.deliveries[0]?.shippingAddressName ??
            (order.orderType === "pickup" ? "À emporter" : "Sur place");

        await sendOrderReceiptFR({
            to,
            customerName,
            orderNumber: order.number,
            date: DateTime.fromJSDate(order.createdAt).setZone("Africa/Douala").toFormat("dd/MM/yyyy HH:mm"),
            itemsList,
            subtotal: String(order.subtotal),
            discount: order.discount,
            deliveryFee: String(deliveryFee),
            total: String(order.total),
            address,
            paymentMethod: "En attente",
        });
    } catch (error) {
        console.error("Order receipt (WhatsApp) failed for", orderNumber, error);
    }
}

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
        let actor: "CUSTOMER" | "STAFF" | "EMPLOYEE";

        if (req.user.role === "CUSTOMER") {
            actor = "CUSTOMER";
        } else if (data.customerPhone) {
            actor = "STAFF";      // staff ordering on behalf of a customer
        } else {
            actor = "EMPLOYEE";   // staff ordering for themselves (payroll)
        }

        // Step 3: everything below runs in one transaction
        const newOrder = await prisma.$transaction(async (tx) => {

            // Step 4: price items & track prep time
            let subtotal = 0;
            let longestPrepTime = 0;
            const itemsToCreate: Array<{
                productId?: string;
                productVariantId?: string;
                addonId?: string;
                menuId?: string;
                instructions?: string;
                quantity: number;
                price: number;
                type: "product" | "menu" | "addons";
                status: "pending";
                estimatedReadyAt: Date;
            }> = [];

            for (const item of data.items) {
                let price: number | undefined;
                let prepTime = 0;

                if (item.type === "product") {
                    const product = await tx.products.findUnique({
                        where: { id: item.productId! },
                        select: { price: true, preparationTime: true },
                    });
                    if (!product) throw new HttpError(404, "Product not found");

                    price = product.price;
                    prepTime = product.preparationTime ?? 0;

                    if (item.productVariantId) {
                        const variant = await tx.productVariants.findUnique({
                            where: { id: item.productVariantId },
                            select: { price: true, productId: true },
                        });
                        if (!variant || variant.productId !== item.productId) {
                            throw new HttpError(400, "Variant does not belong to this product", "INVALID_VARIANT");
                        }
                        price = variant.price;
                    } else {
                        // No variant chosen: if this product HAS variants, one must be picked.
                        const variantCount = await tx.productVariants.count({ where: { productId: item.productId! } });
                        if (variantCount > 0) {
                            throw new HttpError(400, "This product requires a variant", "INVALID_VARIANT");
                        }
                    }
                }

                if (item.type === "menu") {
                    const menu = await tx.menu.findUnique({
                        where: { id: item.menuId! },
                        select: { price: true, preparationTime: true },
                    });
                    if (!menu) throw new HttpError(404, "Menu not found");

                    price = menu.price;
                    prepTime = menu.preparationTime ?? 0;
                }

                if (item.type === "addons") {
                    const addon = await tx.addons.findUnique({
                        where: { id: item.addonId! },
                        select: { price: true },
                    });
                    if (!addon) throw new HttpError(404, "Addon not found");

                    price = addon.price;
                }

                if (price === undefined) {
                    throw new HttpError(400, `Price not found for item type ${item.type}`);
                }

                subtotal += price * item.quantity;
                if (prepTime > longestPrepTime) longestPrepTime = prepTime;

                itemsToCreate.push({
                    productId: item.productId,
                    productVariantId: item.productVariantId,
                    addonId: item.addonId,
                    menuId: item.menuId,
                    instructions: item.instructions,
                    quantity: item.quantity,
                    price,
                    type: item.type,
                    status: "pending" as const,
                    estimatedReadyAt: new Date(Date.now() + prepTime * 60 * 1000),
                });
            }

            subtotal = Math.round(subtotal);

            // Step 5: branch, delivery fee, estimated delivery
            let deliveryFee = 0;
            let estimatedDeliveryTime: Date | null = null;
            let branchId: string;

            if (data.orderType === "delivery") {
                const shippingAddress = await tx.shippingAddresses.findUnique({
                    where: { name: data.shippingAddressName },
                    select: { deliveryFee: true, deliveryTime: true, branchId: true },
                });
                if (!shippingAddress) throw new HttpError(404, "Shipping address not found");

                deliveryFee = shippingAddress.deliveryFee;
                branchId = shippingAddress.branchId;

                const totalMinutes = longestPrepTime + shippingAddress.deliveryTime;
                estimatedDeliveryTime = new Date(Date.now() + totalMinutes * 60 * 1000);

            } else if (data.orderType === "dineIn") {
                const table = await tx.table.findUnique({
                    where: { id: data.tableId },
                    select: { floorId: true, floor: { select: { branchId: true } } },
                });
                if (!table) throw new HttpError(404, "Table not found");
                branchId = table.floor.branchId;

            } else {
                // pickup
                if (!data.branchId) throw new HttpError(400, "branchId is required for pickup orders");
                branchId = data.branchId;
            }

            // Step 6: totals
            const discount = 0;
            const total = subtotal - discount + deliveryFee;

            // Step 7: who owns the order & who placed it
            let customerId: string | undefined;
            let payrollEmployeeEmail: string | undefined;
            let placedByEmail: string | null = null;   // for OrderStatusHistory.changedByEmail

            if (actor === "CUSTOMER") {
                customerId = req.user.Id;
                if (!customerId) throw new HttpError(401, "Customer id missing from token");
                // placedByEmail stays null — the customer placed it, not an employee

            } else if (actor === "STAFF") {
                placedByEmail = req.user.Id;

                const customer = await tx.customers.findUnique({
                    where: { phone: data.customerPhone },
                    select: { customerId: true },
                });
                if (!customer) {
                    throw new HttpError(400, "Invalid or inexistent customer phone number");
                }
                customerId = customer.customerId;

            } else {
                // EMPLOYEE — payroll self-order
                payrollEmployeeEmail = req.user.Id;
                if (!payrollEmployeeEmail) throw new HttpError(401, "Employee email missing from token");
                placedByEmail = payrollEmployeeEmail;   // employee placed it themselves
            }

            // Step 8: create the order
            const number = await CreateIdentifier("ORD");
            if (!number) throw new HttpError(500, "Could not create order identifier");

            const order = await tx.orders.create({
                data: {
                    number,
                    branchId,
                    customerId,
                    payrollEmployeeEmail,
                    discount,
                    subtotal,
                    total,
                    status: "pending",
                    orderType: data.orderType,
                },
            });

            // Step 8b: first OrderStatusHistory row — fromStatus=null, toStatus=pending
            await recordStatusChange(tx, order.number, null, "pending", placedByEmail);

        // Step 9: order items (one row per item)
            for (const item of itemsToCreate) {
                await tx.orderItems.create({
                    data: {
                        orderNumber: order.number,
                        productId: item.productId,
                        productVariantId: item.productVariantId,
                        menuId: item.menuId,
                        addonId: item.type === "addons" ? item.addonId : undefined,
                        Instructions: item.instructions,   // schema really uses capital I
                        quantity: item.quantity,
                        price: item.price,
                        type: item.type,
                        status: item.status,
                        estimatedReadyAt: item.estimatedReadyAt,
                    },
                });
            }
            // Step 10: type-specific row
            if (data.orderType === "delivery") {
                if (!estimatedDeliveryTime) throw new HttpError(500, "Estimated delivery time missing");

                const deliveryId = await CreateIdentifier("DEL");
                if (!deliveryId) throw new HttpError(500, "Unable to create delivery identifier");

                await tx.deliveries.create({
                    data: {
                        id: deliveryId,
                        orderNumber: order.number,
                        shippingAddressName: data.shippingAddressName,
                        status: "pending",
                        estimatedDeliveryTime,
                    },
                });
            }

            if (data.orderType === "pickup") {
                const pickupId = await CreateIdentifier("PICKUP");
                if (!pickupId) throw new HttpError(500, "Unable to create pickup identifier");

                await tx.pickupOrders.create({
                    data: {
                        id: pickupId,
                        orderNumber: order.number,
                        pickupTime: data.pickupTime,
                    },
                });
            }

            if (data.orderType === "dineIn") {
                const dineId = await CreateIdentifier("DINE");
                if (!dineId) throw new HttpError(500, "Unable to create dine-in identifier");

                await tx.dineInOrders.create({
                    data: {
                        id: dineId,
                        orderNumber: order.number,
                        tableId: data.tableId,
                    },
                });
            }

            // Step 10b: Yousra Points reward — 10% of total
            // Customers (CUSTOMER + STAFF-on-behalf) earn points; EMPLOYEE orders don't.
            if (customerId) {
                const customer = await tx.customers.findUnique({
                    where: { customerId },
                    include: { accounts: true },
                });
                if (!customer) throw new HttpError(400, "Customer not found for reward");

                if (customer.accounts) {
                    const coins = convertToYousraCoins(0.1 * total);

                    if (coins > 0) {
                        // 1. credit balance
                        await creditAccount(customer.customerId, coins, tx);

                        // 2. log the movement — system credit (earn)
                        await tx.pointsTransaction.create({
                            data: {
                                amount: coins,
                                fromCustomerId: null,
                                toCustomerId: customer.customerId,
                                orderNumber: order.number,
                                note: "Order reward (10%)",
                            },
                        });
                    }
                }
            }

            return order;
        },
        {
            maxWait: 10000,
            timeout: 20000,
        });

        // Step 11: respond, then send the receipt (never blocks the response)
        res.status(201).json(newOrder);
        void sendOrderReceipt(newOrder.number);

    } catch (error) {
        if (error instanceof HttpError) {
            res.status(error.status).json({ message: error.message, code: error.code });
            return;
        }
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
        const newOrder = await prisma.$transaction(async (tx) => {

            // Step 3: loop through the items, get prices and prep times
            let subtotal = 0;
            let longestPrepTime = 0;
            const itemsToCreate: Array<{
                productId?: string;
                productVariantId?: string;
                addonId?: string;
                menuId?: string;
                instructions?: string;
                quantity: number;
                price: number;
                type: "product" | "menu" | "addons";
                status: "pending";
                estimatedReadyAt: Date;
            }> = [];

            for (const item of data.items) {
                let price: number | undefined;
                let prepTime = 0;

                if (item.type === "product") {
                    const product = await tx.products.findUnique({
                        where: { id: item.productId! },
                        select: { price: true, preparationTime: true },
                    });
                    if (!product) throw new HttpError(404, "Product not found");

                    price = product.price;
                    prepTime = product.preparationTime ?? 0;

                    if (item.productVariantId) {
                        const variant = await tx.productVariants.findUnique({
                            where: { id: item.productVariantId },
                            select: { price: true, productId: true },
                        });
                        if (!variant || variant.productId !== item.productId) {
                            throw new HttpError(400, "Variant does not belong to this product", "INVALID_VARIANT");
                        }
                        price = variant.price;
                    } else {
                        const variantCount = await tx.productVariants.count({ where: { productId: item.productId! } });
                        if (variantCount > 0) {
                            throw new HttpError(400, "This product requires a variant", "INVALID_VARIANT");
                        }
                    }
                }

                if (item.type === "menu") {
                    const menu = await tx.menu.findUnique({
                        where: { id: item.menuId! },
                        select: { price: true, preparationTime: true },
                    });
                    if (!menu) throw new HttpError(404, "Menu not found");

                    price = menu.price;
                    prepTime = menu.preparationTime ?? 0;
                }

                if (item.type === "addons") {
                    const addon = await tx.addons.findUnique({
                        where: { id: item.addonId! },
                        select: { price: true },
                    });
                    if (!addon) throw new HttpError(404, "Addon not found");

                    price = addon.price;
                }

                if (price === undefined) {
                    throw new HttpError(400, `Price not found for item type ${item.type}`);
                }

                subtotal += price * item.quantity;
                if (prepTime > longestPrepTime) longestPrepTime = prepTime;

                itemsToCreate.push({
                    productId: item.productId,
                    productVariantId: item.productVariantId,
                    addonId: item.addonId,
                    menuId: item.menuId,
                    instructions: item.instructions,
                    quantity: item.quantity,
                    price,
                    type: item.type,
                    status: "pending" as const,
                    estimatedReadyAt: new Date(Date.now() + prepTime * 60 * 1000),
                });
            }

            subtotal = Math.round(subtotal);

            // Step 4: find the branch, delivery fee and estimated delivery time
            let deliveryFee = 0;
            let estimatedDeliveryTime: Date | null = null;
            let branchId: string;

            if (data.orderType === "delivery") {
                const shippingAddress = await tx.shippingAddresses.findUnique({
                    where: { name: data.shippingAddressName },
                    select: { deliveryFee: true, deliveryTime: true, branchId: true },
                });
                if (!shippingAddress) throw new HttpError(404, "Shipping address not found");

                deliveryFee = shippingAddress.deliveryFee;
                branchId = shippingAddress.branchId;

                const totalMinutes = longestPrepTime + shippingAddress.deliveryTime;
                estimatedDeliveryTime = new Date(Date.now() + totalMinutes * 60 * 1000);

            } else if (data.orderType === "dineIn") {
                const table = await tx.table.findUnique({
                    where: { id: data.tableId },
                    select: { floorId: true, floor: { select: { branchId: true } } },
                });
                if (!table) throw new HttpError(404, "Table not found");
                branchId = table.floor.branchId;

            } else {
                // pickup
                if (!data.branchId) throw new HttpError(400, "branchId is required for pickup orders");
                branchId = data.branchId;
            }

            // Step 5: totals (promotions will come later)
            const discount = 0;
            const total = subtotal - discount + deliveryFee;

            const number = await CreateIdentifier("ORD");
            if (!number) throw new HttpError(500, "Could not create order identifier");

            // Step 6: create the order ONCE
            const order = await tx.orders.create({
                data: {
                    number,
                    branchId,
                    guestName: data.guestName,
                    guestPhone: data.guestPhone,
                    discount,
                    subtotal,
                    total,
                    status: "pending",
                    orderType: data.orderType,
                },
            });

            // Step 6b: first OrderStatusHistory row — a guest order has no employee behind it
            await recordStatusChange(tx, order.number, null, "pending", null);
            // Step 7: create the order items (one row per item)
            for (const item of itemsToCreate) {
                await tx.orderItems.create({
                    data: {
                        orderNumber: order.number,
                        productId: item.productId,
                        productVariantId: item.productVariantId,
                        menuId: item.menuId,
                        addonId: item.type === "addons" ? item.addonId : undefined,
                        Instructions: item.instructions,
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
                if (!estimatedDeliveryTime) throw new HttpError(500, "Estimated delivery time missing");

                const deliveryId = await CreateIdentifier("DEL");
                if (!deliveryId) throw new HttpError(500, "Unable to create delivery identifier");

                await tx.deliveries.create({
                    data: {
                        id: deliveryId,
                        orderNumber: order.number,
                        shippingAddressName: data.shippingAddressName,
                        status: "pending",
                        estimatedDeliveryTime,
                    },
                });
            }

            if (data.orderType === "pickup") {
                const pickupId = await CreateIdentifier("PICKUP");
                if (!pickupId) throw new HttpError(500, "Unable to create pickup identifier");

                await tx.pickupOrders.create({
                    data: {
                        id: pickupId,
                        orderNumber: order.number,
                        pickupTime: data.pickupTime,
                    },
                });
            }

            if (data.orderType === "dineIn") {
                const dineId = await CreateIdentifier("DINE");
                if (!dineId) throw new HttpError(500, "Unable to create dine-in identifier");

                await tx.dineInOrders.create({
                    data: {
                        id: dineId,
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
        });

        // Step 9: respond, then send the receipt (never blocks the response)
        res.status(201).json(newOrder);
        void sendOrderReceipt(newOrder.number);

    } catch (error) {
        if (error instanceof HttpError) {
            res.status(error.status).json({ message: error.message, code: error.code });
            return;
        }
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
    // For a customer, req.user.Id is their customerId
    const customerId = req.user.Id;

    if (!customerId) {
        res.status(401).json({ error: { message: "Please login", code: "UNAUTHORIZED" } });
        return;
    }

    // Expect ?view=current or ?view=history (default: current)
    const view = req.query.view === "history" ? "history" : "current";

    try {
        const orders = await prisma.orders.findMany({
            where: {
                customerId,
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
            select: { orderType: true, subtotal: true, discount: true, total: true, status: true },
        });

        if (!existing) {
            res.status(404).json({ error: "Order not found" });
            return;
        }

        // Step 6: the fields the client sent
        const status = data.status;
        const discount = data.discount;
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

        // Step 8: check that the driver and table exist
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

                // Update the main order (status / discount)
                if (status !== undefined || discount !== undefined) {
                    await tx.orders.update({
                        where: { number: number },
                        data: {
                            status: status,
                            discount: discount,
                            total: newTotal,
                        },
                    });
                }

                // A status change is recorded in the audit log
                if (status !== undefined) {
                    await recordStatusChange(tx, number, existing.status, status, req.user.Id);
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

         if(!result.success) {
            const fieldErrors = z.flattenError(result.error)
            res.status(400).json({message: " Wrong Input Values" , error: fieldErrors.fieldErrors})
            return;
         }

         const { status } = result.data;

         // status is optional in the schema, so a missing ?status is rejected here
         if (!status) {
            res.status(400).json({ error: "A status query parameter is required" });
            return;
         }

         const number = req.params.number;

         if (typeof number !== "string") {
            res.status(400).json({ error: "Invalid order number" });
            return;
         }

        const updatedOrder = await prisma.$transaction(async (tx) => {
            // Read the current status first so the audit log keeps the "from -> to" move
            const current = await tx.orders.findUnique({
                where: { number },
                select: { status: true },
            });

            const result = await tx.orders.update({
                where: { number },
                data: { status },
                include: fullOrderInclude,
            });

            await recordStatusChange(tx, number, current?.status ?? null, status, req.user?.Id ?? null);

            return result;
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

        // Only a pending order can be dispatched; anything else is a conflict
        if (order.status !== "pending") {
            res.status(409).json({ error: { message: "Order is already dispatched or finished" } });
            return;
        }

        // One transaction: update order + all its items + the audit row
        await prisma.$transaction(async (tx) => {
            await tx.orders.update({
                where: { number: orderNumber },
                data: { status: "preparing" },
            });

            await tx.orderItems.updateMany({
                where: { orderNumber: orderNumber },
                data: { status: "in_station" },
            });

            await recordStatusChange(tx, orderNumber, "pending", "preparing", req.user?.Id ?? null);
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
                        // itemId is the OrderItems row id — this is what the frontend sends back
                        // to PATCH /items/:itemId/status when marking it ready.
                        itemId: item.id,
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
                                // Same here: the order item's id, so this menu can be marked ready.
                                itemId: item.id,
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

        // Step 2: mark the item ready. If it was the last one, mark the whole order ready too.
        const orderReady = await prisma.$transaction(async (tx) => {
            await tx.orderItems.update({
                where: { id: itemId },
                data: { status: "ready" },
            });

            // Any items in this order still not ready?
            const remainingItems = await tx.orderItems.findMany({
                where: {
                    orderNumber: item.orderNumber,
                    status: { not: "ready" },
                },
            });

            if (remainingItems.length > 0) {
                return false;
            }

            // Nothing left — the order moves from preparing to ready, and we log it.
            await tx.orders.update({
                where: { number: item.orderNumber },
                data: { status: "ready" },
            });

            await recordStatusChange(tx, item.orderNumber, "preparing", "ready", req.user?.Id ?? null);

            return true;
        });

        res.status(200).json({
            data: {
                message: "Item marked as ready",
                orderReady,
            },
        });
        return;

    } catch (error) {
        console.error("Error marking item ready:", error);
        res.status(500).json({ error: { message: "Failed to mark item ready" } });
        return;
    }
};