import { Router } from "express";
import {
    addFavorite, addReview, addUserPreference,
    getReviewsByProductId, getReviewsByCustomerId, getFavoritesByCustomerId, getUserPreferences,
    getCustomers,
    createAddress,
    getCustomerAddress,
    myBalance,
    sendYousraCoins,
    updateMyProfile,
    OpenMyAccount,
    myProfile,
} from "./crm.service.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";


const router = Router();

// PUBLIC
router.get("/products/:productId/reviews", getReviewsByProductId);

// CUSTOMER ONLY (favorites and reviews belong to customers)
router.post("/favorites", authMiddleware, roleMiddleware("CUSTOMER"), addFavorite);
router.get("/favorites", authMiddleware, roleMiddleware("CUSTOMER"), getFavoritesByCustomerId);
router.post("/reviews", authMiddleware, roleMiddleware("CUSTOMER"), addReview);
router.get("/reviews", authMiddleware, roleMiddleware("CUSTOMER"), getReviewsByCustomerId);
router.post("/address", authMiddleware , roleMiddleware("CUSTOMER"), createAddress)
router.get("/address", authMiddleware , roleMiddleware("CUSTOMER"), getCustomerAddress)
router.get("/profile", authMiddleware , myProfile)
router.patch("/profile",authMiddleware , updateMyProfile)

//Yousra Coins
router.get("/yousracoins/balance", authMiddleware , myBalance)
router.post("/yousracoins/open", authMiddleware,  OpenMyAccount)
router.post("/yousracoins/send" , authMiddleware,  sendYousraCoins)



// ANY LOGGED-IN USER (customer or employee)
router.put("/preferences", authMiddleware, addUserPreference);
router.get("/preferences", authMiddleware, getUserPreferences);
router.get("/customers", authMiddleware , roleMiddleware("CASHIER","ADMIN","MANAGER", "WAITER") ,getCustomers); // special to find customers


// 

export default router;
