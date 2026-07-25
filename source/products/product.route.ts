import { Router } from "express";
import upload from "../middlewares/upload";
import { createProduct } from "./product.controller";

const router = Router();

router.post("/" , upload.single("image") , createProduct);


export default router;