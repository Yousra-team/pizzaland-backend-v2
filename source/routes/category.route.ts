import {Router} from "express";
import { createCategory, getCategory, updateCategory } from "../controllers/category.controller";


const router = Router();


router.post("/", createCategory);




export default router;