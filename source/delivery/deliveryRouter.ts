import {Router} from "express";
import { getAvailableDeliveries, claimDelivery, getMyDeliveries, updateDeliveryStatus } from "./delivery.service";
import authMiddleware from "../middlewares/auth.middleware";
import roleMiddleware from "../middlewares/role.middleware";

const router = Router();

// Every delivery route is for logged-in delivery drivers only
router.use(authMiddleware, roleMiddleware("DELIVERY_DRIVER"));

router.get("/available", getAvailableDeliveries);
router.get("/mine", getMyDeliveries);          // ?view=history for delivered/failed
router.patch("/:deliveryId/claim", claimDelivery);
router.patch("/:deliveryId/status", updateDeliveryStatus);

export default router;
