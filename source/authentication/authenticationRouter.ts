// src/routes/auth.routes.ts
import { Router } from "express";
import {
    registerCustomer,
    registerEmployee,
    registerEmployeeAsAdmin,
    loginCustomer,
    loginEmployee,
    loginAdmin,
    verifyToken,
    refreshAccessToken,
    logout,
} from "./authentication"; // adjust path to wherever this file actually lives

const router = Router();

// Registration
router.post("/customers/register", registerCustomer);
router.post("/employees/register", registerEmployee);
router.post("/employees/register-admin", registerEmployeeAsAdmin);

// Login — issues a magic link / verification code
router.post("/customers/login", loginCustomer);
router.post("/employees/login", loginEmployee);
router.post("/admins/login", loginAdmin);

// Shared verification + token lifecycle
router.post("/verify", verifyToken);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);

export default router;
