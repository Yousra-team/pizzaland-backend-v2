import { Router } from "express";
import {
    createBranch, createManyBranches, createShippingAddress, createManyShippingAddresses,
    getBranches, getAbranchById, getAshippingAddress, getManyShippingAddresses,
    updateBranches, updateShippingAddresses,
    deleteBranch, deleteManyBranches, deleteShippingAddress, deleteManyShippingAddresses,
} from "./branch.service.js";


const router = Router();

// Shipping address routes come first so "/shipping-addresses" is not captured by "/:id"
router.post("/shipping-addresses", createShippingAddress);
router.post("/shipping-addresses/bulk", createManyShippingAddresses);
router.get("/shipping-addresses", getManyShippingAddresses);
router.get("/shipping-addresses/:name", getAshippingAddress);
router.patch("/shipping-addresses/:name", updateShippingAddresses);
router.delete("/shipping-addresses/bulk", deleteManyShippingAddresses);
router.delete("/shipping-addresses/:name", deleteShippingAddress);

// Branch routes
router.post("/", createBranch);
router.post("/bulk", createManyBranches);
router.get("/", getBranches);
router.get("/:id", getAbranchById);
router.patch("/:id", updateBranches);
router.delete("/bulk", deleteManyBranches);
router.delete("/:id", deleteBranch);


export default router;
