import { Router } from "express";
import upload from "../middlewares/upload.image";
import { createProduct } from "./product.controller";

const router = Router();

router.post("/" , upload.single("image") , createProduct);


export default router;