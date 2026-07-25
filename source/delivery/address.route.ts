import {Router} from "express";
import {createAddress} from "./shippingaddresses.controller";

const router = Router();

router.post("/", createAddress);

export default router;