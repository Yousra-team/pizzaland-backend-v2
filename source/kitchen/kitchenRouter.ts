import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";
import { CreatekitchenStation, getKitchenStation, UpdatekitchenStation } from "./kitchen.service.js";

const router = Router()

router.post("/stations" , authMiddleware , roleMiddleware("ADMIN","MANAGER") ,CreatekitchenStation);
router.patch("/stations" , authMiddleware , roleMiddleware("ADMIN","MANAGER") , UpdatekitchenStation);
router.get("/stations"  , getKitchenStation);

export default router