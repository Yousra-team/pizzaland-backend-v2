import { Router } from "express";
import { getAllAddons, getAllCategories, getAllEmployees, getAllMenus, getAllOrders, getAllProducts, getAllsubcategories, updateEmployees } from "./admin.service.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";


const router = Router()

router.get("/employees", authMiddleware , roleMiddleware("ADMIN","CASHIER", "MANAGER"),getAllEmployees) 
router.get("/products", authMiddleware , roleMiddleware("ADMIN"), getAllProducts)
router.get("/addons", authMiddleware , roleMiddleware("ADMIN"), getAllAddons)
router.get("/categories",authMiddleware , roleMiddleware("ADMIN"), getAllCategories)
router.get("/menus", authMiddleware , roleMiddleware("ADMIN"),getAllMenus)
router.get("/subcategories",authMiddleware , roleMiddleware("ADMIN"), getAllsubcategories)
router.get("/orders", authMiddleware , roleMiddleware("ADMIN"), getAllOrders)

//update
router.patch("/employees" ,authMiddleware , roleMiddleware("ADMIN","MANAGER"), updateEmployees)

export default router