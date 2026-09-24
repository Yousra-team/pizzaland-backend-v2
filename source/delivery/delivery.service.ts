import { Request, Response } from "express";
import * as z from "zod";
import { prisma } from "../lib/prisma.js";
import { driverDeliveryInclude, deliveryStatusSchema } from "./delivery.schema.js";

// All handlers run after authMiddleware + roleMiddleware("DELIVERY_DRIVER"),
// so req.user.userId is the driver's email.


// ── 1. Available deliveries at driver's branch (unassigned only) ──
export const getAvailableDeliveries = async (req: Request, res: Response): Promise<void> => {
    const email = req.user?.userId;
    if (!email) {
        res.status(401).json({ error: { message: "Authentication required", code: "UNAUTHENTICATED" } });
        return;
    }

    try {
        const driver = await prisma.employees.findUnique({
            where: { email },
            select: { branchId: true },
        });

        if (!driver?.branchId) {
            res.status(403).json({
                error: { message: "Not assigned to a branch", code: "NO_BRANCH" },
            });
            return;
        }

        const deliveries = await prisma.deliveries.findMany({
            where: {
                driverEmail: null,                    // not yet claimed
                status: "pending",
                order: { branchId: driver.branchId }, // same branch as driver
            },
            include: driverDeliveryInclude,
            orderBy: { estimatedDeliveryTime: "asc" },
        });

        res.status(200).json({ data: deliveries });
    } catch (error) {
        console.error("getAvailableDeliveries failed:", error);
        res.status(500).json({
            error: { message: "Failed to fetch deliveries", code: "FETCH_FAILED" },
        });
    }
};


// ── 2. Driver claims a delivery ──
export const claimDelivery = async (req: Request, res: Response): Promise<void> => {
    const email = req.user?.userId;
    const deliveryId = req.params.deliveryId;

    if (typeof deliveryId !== "string" || !email) {
        res.status(400).json({ error: { message: "Invalid request", code: "INVALID_PARAM" } });
        return;
    }

    try {
        const claimed = await prisma.$transaction(async (tx) => {
            // Check driver's branch
            const driver = await tx.employees.findUnique({
                where: { email },
                select: { branchId: true },
            });
            if (!driver?.branchId) throw new Error("Not assigned to a branch");

            // Fetch delivery + its order's branch
            const delivery = await tx.deliveries.findUnique({
                where: { id: deliveryId },
                select: { order: { select: { branchId: true } } },
            });

            if (!delivery) throw new Error("Delivery not found");
            if (delivery.order.branchId !== driver.branchId) {
                throw new Error("Delivery is not at your branch");
            }

            // Claim it in ONE query: the update only happens if the delivery is still
            // unclaimed AND pending. If two drivers claim at the same moment, only one
            // update matches; the other gets count 0. Finished deliveries never match.
            const result = await tx.deliveries.updateMany({
                where: { id: deliveryId, driverEmail: null, status: "pending" },
                data: { driverEmail: email, status: "assigned" },
            });
            if (result.count === 0) throw new Error("Delivery already claimed");

            return tx.deliveries.findUniqueOrThrow({
                where: { id: deliveryId },
                include: driverDeliveryInclude,
            });
        });

        res.status(200).json({ data: claimed });
    } catch (err: any) {
        console.error("claimDelivery failed:", err);

        const messageMap: Record<string, number> = {
            "Not assigned to a branch": 403,
            "Delivery not found":       404,
            "Delivery already claimed": 409,
            "Delivery is not at your branch": 403,
        };

        const status = messageMap[err.message];
        if (status) {
            res.status(status).json({ error: { message: err.message, code: "CLAIM_FAILED" } });
            return;
        }
        // Unknown error (e.g. database): never send its message to the client
        res.status(500).json({ error: { message: "Failed to claim delivery", code: "CLAIM_FAILED" } });
    }
};


// ── 3. Driver's own deliveries (active + history) ──
export const getMyDeliveries = async (req: Request, res: Response): Promise<void> => {
    const email = req.user?.userId;
    // Without this check, `driverEmail: undefined` means "no filter" to Prisma
    // and every driver's deliveries would be returned
    if (!email) {
        res.status(401).json({ error: { message: "Authentication required", code: "UNAUTHENTICATED" } });
        return;
    }

    const view = req.query.view === "history" ? "history" : "active";

    try {
        const deliveries = await prisma.deliveries.findMany({
            where: {
                driverEmail: email,
                status: view === "history"
                    ? { in: ["delivered", "failed"] }
                    : { in: ["assigned", "in_transit"] },
            },
            include: driverDeliveryInclude,
            orderBy: { estimatedDeliveryTime: "asc" },
        });

        res.status(200).json({ data: deliveries });
    } catch (error) {
        console.error("getMyDeliveries failed:", error);
        res.status(500).json({
            error: { message: "Failed to fetch deliveries", code: "FETCH_FAILED" },
        });
    }
};


// ── 4. Driver updates one of their deliveries ──
//    assigned → in_transit (picked up), then assigned/in_transit → delivered or failed
export const updateDeliveryStatus = async (req: Request, res: Response): Promise<void> => {
    const email = req.user?.userId;
    const deliveryId = req.params.deliveryId;

    if (typeof deliveryId !== "string" || !email) {
        res.status(400).json({ error: { message: "Invalid request", code: "INVALID_PARAM" } });
        return;
    }

    const result = deliveryStatusSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            error: { message: "Invalid status", code: "INVALID_BODY", details: z.flattenError(result.error).fieldErrors },
        });
        return;
    }
    const { status } = result.data;

    try {
        const updatedDelivery = await prisma.$transaction(async (tx) => {
            const delivery = await tx.deliveries.findUnique({
                where: { id: deliveryId },
                select: { driverEmail: true, orderNumber: true },
            });

            if (!delivery) throw new Error("Delivery not found");
            if (delivery.driverEmail !== email) throw new Error("Not your delivery");

            // Which current statuses allow the move: in_transit only from assigned,
            // delivered/failed from assigned or in_transit. Checked inside the update itself,
            // so a finished delivery can never change again.
            const allowedFrom: ("assigned" | "in_transit")[] =
                status === "in_transit" ? ["assigned"] : ["assigned", "in_transit"];

            const updated = await tx.deliveries.updateMany({
                where: { id: deliveryId, driverEmail: email, status: { in: allowedFrom } },
                data: {
                    status,
                    // undefined = leave the column unchanged
                    actualDeliveryTime: status === "delivered" ? new Date() : undefined,
                },
            });
            if (updated.count === 0) throw new Error("Delivery status cannot be changed");

            // Keep the order in sync with the delivery
            if (status === "in_transit") {
                await tx.orders.update({
                    where: { number: delivery.orderNumber },
                    data: { status: "out_for_delivery" },
                });
            } else if (status === "delivered") {
                await tx.orders.update({
                    where: { number: delivery.orderNumber },
                    data: { status: "delivered" },
                });
            }

            return tx.deliveries.findUniqueOrThrow({
                where: { id: deliveryId },
                include: driverDeliveryInclude,
            });
        });

        res.status(200).json({ data: updatedDelivery });
    } catch (err: any) {
        console.error("updateDeliveryStatus failed:", err);

        const messageMap: Record<string, number> = {
            "Delivery not found":                404,
            "Not your delivery":                 403,
            "Delivery status cannot be changed": 409,
        };

        const statusCode = messageMap[err.message];
        if (statusCode) {
            res.status(statusCode).json({ error: { message: err.message, code: "STATUS_UPDATE_FAILED" } });
            return;
        }
        res.status(500).json({ error: { message: "Failed to update delivery status", code: "STATUS_UPDATE_FAILED" } });
    }
};
