import { Request, Response } from "express";
import * as z from "zod";
import { prisma } from "../lib/prisma.js";
import { driverDeliveryInclude, deliveryStatusSchema, AssignDeliverySchema } from "./delivery.schema.js";
import { CreateIdentifier } from "../utilities/counter.js";

// All handlers run after authMiddleware + roleMiddleware("DELIVERY_DRIVER"),
// so req.user.userId is the driver's email.


// ── 1. Available deliveries at driver's branch (unassigned only) ──
export const getAvailableDeliveries = async (req: Request, res: Response): Promise<void> => {
    const email = req.user.Id;
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
                error: { message: "Not assigned to a branch"},
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

export const assignDeliveryToDriver = async (req: Request, res: Response): Promise<void> => {
    try {
           
           const result = AssignDeliverySchema.safeParse(req.body);
           if(!result.success) {
            res.status(400).json({message:"Unexpected or missing input"})
            return;
           }
           
           const {order , email} = result.data

           const isThisAdriver = await prisma.employees.findUnique({
              where: {email: email , role: "DELIVERY_DRIVER"}
           });

           if(!isThisAdriver) {
            res.status(400).json({message:"This is not a driver"})
            return;
           }

           if(!order) {
            res.status(400).json({message:"Order Number is required"})
            return;
           }
           // Add a check to ensure the order is in the right status before it can be assigned

           const delivery = await prisma.deliveries.findFirst({
             where: {
               orderNumber: order,
               status: "pending" 
             },
             select: {
                id: true
             }
           });

           if(!delivery) {
             res.status(400).json({message:"No deliveries found"})
             return;
           };

           const Id = delivery.id
           
           const updatedDelivery = await prisma.deliveries.update({
               where: {id: Id},
               data: { 
                driverEmail: email,
                status: "assigned" },
                include: driverDeliveryInclude,
           });
      
      res.status(200).json(updatedDelivery);   
    } catch (error) {
       res.status(500).json({message: "An Internal server error"})
       console.log(error)
 }
};

export const findDrivers = async (req: Request, res: Response): Promise<void> => {
    try {
        const myEmail = req.user.Id

        if (!myEmail) {
            res.status(401).json({ message: "You are not logged in" })
            return;
        }

        const cashierOrManager = await prisma.employees.findUnique({
            where: { email: myEmail },
            select: { branchId: true }
        });

        if (!cashierOrManager) {
            res.status(404).json({ message: "No cashier with this email exists" })
            return;
        }

        if (!cashierOrManager.branchId) {
            res.status(400).json({ message: "Cashier is not assigned to a branch" })
            return;
        }

        const drivers = await prisma.employees.findMany({
            where: { role: "DELIVERY_DRIVER", branchId: cashierOrManager.branchId }
        });

        res.status(200).json(drivers)

    } catch (error) {
        res.status(500).json({ message: "Internal server error finding drivers" })
        console.log(error)
    }
};




// ── 2. Driver claims a delivery ──
export const claimDelivery = async (req: Request, res: Response): Promise<void> => {
    const email = req.user.Id;
    const deliveryId = req.params.deliveryId as String;

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
    const email = req.user.Id;
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
    const email = req.user.Id;
    const deliveryId = req.params.deliveryId;

    if (!email || typeof deliveryId !== "string") {
        res.status(400).json({ error: { message: "Invalid request" } });
        return;
    }

    const result = deliveryStatusSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            error: {
                message: "Invalid status",
                code: "INVALID_BODY",
                details: z.flattenError(result.error).fieldErrors,
            },
        });
        return;
    }

    const { status } = result.data;

    try {
        // Load the delivery first so we can answer 404 / 403 cleanly,
        // without throw-and-map in the catch block.
        const delivery = await prisma.deliveries.findUnique({
            where: { id: deliveryId },
            select: { driverEmail: true, orderNumber: true, status: true },
        });

        if (!delivery) {
            res.status(404).json({ error: { message: "Delivery not found" } });
            return;
        }

        if (delivery.driverEmail !== email) {
            res.status(403).json({ error: { message: "Not your delivery" } });
            return;
        }

        // Which current statuses allow the move:
        // in_transit only from assigned; delivered/failed from assigned or in_transit.
        let allowedFrom: ("assigned" | "in_transit")[];
        if (status === "in_transit") {
            allowedFrom = ["assigned"];
        } else {
            allowedFrom = ["assigned", "in_transit"];
        }

        // Does the delivery status change also move the order?
        let newOrderStatus: "out_for_delivery" | "delivered" | null = null;
        if (status === "in_transit") {
            newOrderStatus = "out_for_delivery";
        } else if (status === "delivered") {
            newOrderStatus = "delivered";
        }

        const updatedDelivery = await prisma.$transaction(async (tx) => {
            // Re-check the status inside the transaction via updateMany
            // so a finished delivery can never be changed by a race.
            const updated = await tx.deliveries.updateMany({
                where: { id: deliveryId, driverEmail: email, status: { in: allowedFrom } },
                data: {
                    status,
                    actualDeliveryTime: status === "delivered" ? new Date() : undefined,
                },
            });

            if (updated.count === 0) {
                throw new Error("CONFLICT");
            }

            // Keep the order in sync and record the transition in the audit table.
            if (newOrderStatus) {
                const order = await tx.orders.findUniqueOrThrow({
                    where: { number: delivery.orderNumber },
                    select: { status: true },
                });

                await tx.orders.update({
                    where: { number: delivery.orderNumber },
                    data: { status: newOrderStatus },
                });
                const Id = await CreateIdentifier("OSH")
                await tx.orderStatusHistory.create({
                    data: {
                        id: Id,
                        orderNumber: delivery.orderNumber,
                        fromStatus: order.status,
                        toStatus: newOrderStatus,
                        changedByEmail: email,
                    },
                });
            }

            return tx.deliveries.findUniqueOrThrow({
                where: { id: deliveryId },
                include: driverDeliveryInclude,
            });
        });

        res.status(200).json({ data: updatedDelivery });
    } catch (err: any) {
        if (err.message === "CONFLICT") {
            res.status(409).json({
                error: { message: "Delivery status cannot be changed", code: "STATUS_UPDATE_FAILED" },
            });
            return;
        }
        console.error("updateDeliveryStatus failed:", err);
        res.status(500).json({
            error: { message: "Failed to update delivery status", code: "STATUS_UPDATE_FAILED" },
        });
    }
};