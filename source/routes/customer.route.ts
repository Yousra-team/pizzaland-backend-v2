import { Router } from "express";
import { createCustomer , getAllCustomers} from "../controllers/customer.controller";

const router = Router();

router.post("/", createCustomer);
router.get("/", getAllCustomers);

export default router;

