import { Router } from "express";
import {
    createAddon, createCategory, createManyAddons, createManyCategories, createManyProducts, createProduct,
    createManySubCategories, createSubCategory, makeManyMenus, makeMenu,
    getAllProducts, getProductById, getCategories, getCategoryById, getSubCategories, getSubCategoryById,
    getAddons, getAddonById,
    updateProductById, updateCategoryById, updateSubcategoryById, updateAddonsById,
} from "./product.service.js";
import { upload } from "../middlewares/upload.image.js";


const router = Router();

// CREATE ENDPOINTS
router.post("/products", upload.single("image"), createProduct);
router.post("/products/bulk", createManyProducts);
router.post("/menus", upload.single("image") , makeMenu);
router.post("/menus/bulk", makeManyMenus);
router.post("/addons", upload.single("image"), createAddon);
router.post("/addons/bulk", createManyAddons);
router.post("/categories",upload.single("image"), createCategory);
router.post("/categories/bulk", createManyCategories)
router.post("/subcategories", upload.single("image"), createSubCategory);
router.post("/subcategories/bulk", createManySubCategories);

// GET ENDPOINTS
router.get("/products", getAllProducts);
router.get("/products/:id", getProductById);
router.get("/categories", getCategories);
router.get("/categories/:id", getCategoryById);
router.get("/subcategories", getSubCategories);
router.get("/subcategories/:id", getSubCategoryById);
router.get("/addons", getAddons);
router.get("/addons/:id", getAddonById);

// UPDATE ENDPOINTS
router.patch("/products/:id", upload.single("image"), updateProductById);
router.patch("/categories/:id", upload.single("image"), updateCategoryById);
router.patch("/subcategories/:id", upload.single("image"), updateSubcategoryById);
router.patch("/addons/:id", upload.single("image"), updateAddonsById);


export default router;
