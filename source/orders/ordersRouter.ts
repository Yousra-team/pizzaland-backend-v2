import { Router } from "express";
import {
    createOrder, getOrdersByBranch, getMyOrders, updateOrder, deleteOrders,
    dispatchOrder, updateOrderItemStatus,
} from "./order.service.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";


const router = Router();

// Every order route needs a logged-in user
router.use(authMiddleware);

// CREATE: customers (app) and front-of-house staff (POS)
router.post("/", roleMiddleware("CUSTOMER", "CASHIER", "WAITER", "MANAGER", "ADMIN"), createOrder);

// GET
router.get("/mine", roleMiddleware("CUSTOMER"), getMyOrders);   // ?view=history for finished orders
router.get("/branch",                                           // ?status=pending to filter
    roleMiddleware("CASHIER", "WAITER", "KITCHEN_STAFF", "KITCHEN_CHEF", "MANAGER", "ADMIN"),
    getOrdersByBranch);

// KITCHEN
router.patch("/:number/dispatch", roleMiddleware("KITCHEN_CHEF", "MANAGER", "ADMIN"), dispatchOrder);
router.patch("/items/:itemId/status", roleMiddleware("KITCHEN_STAFF", "KITCHEN_CHEF"), updateOrderItemStatus);

// UPDATE
router.patch("/:number", roleMiddleware("CASHIER", "MANAGER", "ADMIN"), updateOrder);

// DELETE: admins only (body: { numbers: [...] })
router.delete("/", roleMiddleware("ADMIN"), deleteOrders);


export default router;
