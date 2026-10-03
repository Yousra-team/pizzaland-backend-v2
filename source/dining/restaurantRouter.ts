import { Router } from "express";
import { createFloor, createTable, getFloors, getTables, updateTable } from "./restaurant.js";

const router = Router()

router.post("/floors" , createFloor);
router.post("/tables" , createTable);
router.get("/floors" , getFloors);
router.get("/tables" , getTables);
router.patch("/tables/:id" , updateTable);
router.get("/tables/:id" , updateTable);

export default router