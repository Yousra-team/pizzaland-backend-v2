import { Router } from "express";
import { createFloor, createTable } from "./restaurant.js";

const router = Router()

router.post("/floors" , createFloor);
router.post("/tables" , createTable);

export default router