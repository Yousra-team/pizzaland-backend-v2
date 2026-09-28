import { Router } from "express";
import {
    addFavorite, addReview, addUserPreference,
    getReviewsByProductId, getReviewsByCustomerPhone, getFavoritesByCustomerPhone, getUserPreferences,
    getCustomers,
    createAddress,
    getCustomerAddress,
} from "./crm.service.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";


const router = Router();

// PUBLIC
router.get("/products/:productId/reviews", getReviewsByProductId);

// CUSTOMER ONLY (favorites and reviews belong to customers)
router.post("/favorites", authMiddleware, roleMiddleware("CUSTOMER"), addFavorite);
router.get("/favorites", authMiddleware, roleMiddleware("CUSTOMER"), getFavoritesByCustomerPhone);
router.post("/reviews", authMiddleware, roleMiddleware("CUSTOMER"), addReview);
router.get("/reviews", authMiddleware, roleMiddleware("CUSTOMER"), getReviewsByCustomerPhone);
router.post("/address", authMiddleware , roleMiddleware("CUSTOMER"), createAddress)
router.get("/address", authMiddleware , roleMiddleware("CUSTOMER"), getCustomerAddress)

// ANY LOGGED-IN USER (customer or employee)
router.put("/preferences", authMiddleware, addUserPreference);
router.get("/preferences", authMiddleware, getUserPreferences);
router.get("/customers", authMiddleware , roleMiddleware("CASHIER","ADMIN","MANAGER", "WAITER") ,getCustomers); // special to find customers


export default router;
