import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { fullOrderInclude } from "./delivery.schema";





// ── 1. Available deliveries at driver's branch (unassigned only) ──
export const getAvailableDeliveries = async (req: Request, res: Response): Promise<void> => {
    const email = req.user?.userId;

    try {
        const driver = await prisma.employees.findUnique({
            where: { email },
            select: { branchId: true, role: true },
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
            include: {
                shippingAddress: {
                    select: {
                        name: true, neighborhood: true,
                        deliveryFee: true, deliveryTime: true,
                    },
                },
                order: {
                    include: fullOrderInclude,
                },
            },
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
                select: {
                    driverEmail: true,
                    orderNumber: true,
                    order: { select: { branchId: true } },
                },
            });

            if (!delivery) throw new Error("Delivery not found");
            if (delivery.driverEmail) throw new Error("Delivery already claimed");
            if (delivery.order.branchId !== driver.branchId) {
                throw new Error("Delivery is not at your branch");
            }

            // Claim it
            await tx.deliveries.update({
                where: { id: deliveryId },
                data: {
                    driverEmail: email,
                    status: "assigned",
                },
            });

            return tx.orders.findUniqueOrThrow({
                where: { number: delivery.orderNumber },
                include: fullOrderInclude,
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

        const status = messageMap[err.message] ?? 500;
        res.status(status).json({
            error: { message: err.message ?? "Failed to claim delivery", code: "CLAIM_FAILED" },
        });
    }
};


// ── 3. Driver's own deliveries (active + history) ──
export const getMyDeliveries = async (req: Request, res: Response): Promise<void> => {
    const email = req.user?.userId;

    const view = req.query.view === "history" ? "history" : "active";

    try {
        const deliveries = await prisma.deliveries.findMany({
            where: {
                driverEmail: email,
                status: view === "history"
                    ? { in: ["delivered", "failed"] }
                    : { in: ["assigned", "in_transit"] },
            },
            include: {
                shippingAddress: {
                    select: {
                        name: true, neighborhood: true,
                        deliveryFee: true, deliveryTime: true,
                    },
                },
                order: { include: fullOrderInclude },
            },
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