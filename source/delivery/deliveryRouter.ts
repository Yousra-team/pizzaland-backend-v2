import {Router} from "express";
import { getAvailableDeliveries, claimDelivery, getMyDeliveries, updateDeliveryStatus } from "./delivery.service.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";

const router = Router();

// Every delivery route is for logged-in delivery drivers only
router.use(authMiddleware, roleMiddleware("DELIVERY_DRIVER"));

router.get("/available", getAvailableDeliveries);
router.get("/mine", getMyDeliveries);          // ?view=history for delivered/failed
router.patch("/:deliveryId/claim", claimDelivery);
router.patch("/:deliveryId/status", updateDeliveryStatus);

export default router;
