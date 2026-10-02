import { Router } from "express";
import {
    placeOrder, getOrdersByBranch, getMyOrders, updateOrder, deleteOrders,
    dispatchOrder, updateOrderItemStatus,
    GuestplaceOrder,
} from "./order.service.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";


const router = Router();

// Every order route needs a logged-in user


// CREATE: customers (app) and front-of-house staff (POS)
router.post("/",authMiddleware ,  placeOrder); 
router.post("/guest", GuestplaceOrder);  // no auth required for guest orders

// GET
router.get("/mine", authMiddleware,roleMiddleware("CUSTOMER"), getMyOrders);   // ?view=history for finished orders
router.get("/branch", authMiddleware ,                                          // ?status=pending to filter
    roleMiddleware("CASHIER", "WAITER", "KITCHEN_STAFF", "KITCHEN_CHEF", "MANAGER", "ADMIN"),
    getOrdersByBranch);

// KITCHEN
router.patch("/:number/dispatch", authMiddleware,roleMiddleware("KITCHEN_CHEF", "MANAGER", "ADMIN"), dispatchOrder);
router.patch("/items/:itemId/status", authMiddleware,roleMiddleware("KITCHEN_STAFF", "KITCHEN_CHEF"), updateOrderItemStatus);

// UPDATE
router.patch("/:number", authMiddleware,roleMiddleware("CASHIER", "MANAGER", "ADMIN"), updateOrder);

// DELETE: admins only (body: { numbers: [...] })
router.delete("/", authMiddleware, roleMiddleware("ADMIN"), deleteOrders);


export default router;
