import { Router } from "express";
import {
  createCustomer,
  getCustomers,
  getCustomerByPhone,
  updateCustomer,
  createManyCustomers,
} from "../controllers/customer.controller";

const router = Router();

router.post("/", createCustomer);
router.post("/bulk", createManyCustomers);
router.get("/", getCustomers);
router.get("/:phone", getCustomerByPhone);
router.patch("/:phone", updateCustomer);

export default router;

