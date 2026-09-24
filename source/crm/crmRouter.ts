import { Router } from "express";
import {
    addFavorite, addReview, addUserPreference,
    getReviewsByProductId, getReviewsByCustomerPhone, getFavoritesByCustomerPhone, getUserPreferences,
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

// ANY LOGGED-IN USER (customer or employee)
router.put("/preferences", authMiddleware, addUserPreference);
router.get("/preferences", authMiddleware, getUserPreferences);


export default router;
