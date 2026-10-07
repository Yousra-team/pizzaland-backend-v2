import { Router } from "express";
import { getAllEmployees } from "./admin.service.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";


const router = Router()

//router.use(authMiddleware , roleMiddleware("ADMIN"))

router.get("/employees", getAllEmployees) 

export default router