import { Router } from "express";
import { getBranches } from "./branch.controller";
import { createBranch } from "./branch.controller";


const router = Router();

router.post("/", createBranch);
router.get("/", getBranches);


export default router;

