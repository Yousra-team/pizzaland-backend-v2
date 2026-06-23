import {Router} from "express";
import {createAddress} from "../controllers/shippingaddresses.controller";

const router = Router();

router.post("/", createAddress);

export default router;