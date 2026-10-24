import { Router } from "express";
import {
  initiatePayment,
  notifyPayment,
  isMyOrderPaid,
} from "./payment.js";
// import { authenticate } from "../auth/auth.middleware.js"; // adjust path to your real auth middleware

const router = Router();

// ─── Public ──────────────────────────────────────────────
// Monetbil webhook. Must stay unauthenticated — Monetbil has no JWT.
// It is protected by the service-key check inside notifyPayment.
router.post("/notify", notifyPayment);

// ─── Protected ───────────────────────────────────────────
// Customer or cashier starts a payment attempt
router.post("/initiate", /* authenticate, */ initiatePayment);

// Check whether an order has been fully paid
router.get("/status/:orderNumber", /* authenticate, */ isMyOrderPaid);

export default router;