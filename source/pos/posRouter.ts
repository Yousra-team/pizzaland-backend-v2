import { Router } from "express";
import { myCashierOrWaitressHistory } from "./pos.service.js";
import roleMiddleware from "../middlewares/role.middleware.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = Router()

router.get("/history" , authMiddleware , roleMiddleware("CASHIER","WAITRESS") ,myCashierOrWaitressHistory)

export default router