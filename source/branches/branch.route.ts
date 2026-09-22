import { Router } from "express";
import { getBranches } from "./branch.service";
import { createBranch } from "./branch.service";


const router = Router();

router.post("/", createBranch);
router.get("/", getBranches);


export default router;

