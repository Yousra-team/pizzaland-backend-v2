import { Router } from "express";
import { getBranches } from "../controllers/branch.controller";
import { createBranch } from "../controllers/branch.controller";


const router = Router();

router.post("/", createBranch);
router.get("/", getBranches);


export default router;

