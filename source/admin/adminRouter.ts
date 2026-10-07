import { Router } from "express";
import { getAllAddons, getAllCategories, getAllEmployees, getAllMenus, getAllOrders, getAllProducts, getAllsubcategories } from "./admin.service.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";


const router = Router()

router.use(authMiddleware , roleMiddleware("ADMIN"))

router.get("/employees", getAllEmployees) 
router.get("/products", getAllProducts)
router.get("/addons", getAllAddons)
router.get("/categories", getAllCategories)
router.get("/menus", getAllMenus)
router.get("/subcategories", getAllsubcategories)
router.get("/orders", getAllOrders)

export default router