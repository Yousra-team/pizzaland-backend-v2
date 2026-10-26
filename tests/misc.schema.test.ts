import { describe, it, expect } from "vitest";
import { deliveryStatusSchema } from "../source/delivery/delivery.schema.js";
import { paymentDetailsSchema } from "../source/payments/paymentSchema.js";
import { promotionCondition } from "../source/promotions/promotionSchema.js";
import { typeSchema } from "../source/utilities/counterSchema.js";

describe("deliveryStatusSchema", () => {
    it.each(["in_transit", "delivered", "failed"])("accepts %s", (status) => {
        expect(deliveryStatusSchema.safeParse({ status }).success).toBe(true);
    });

    // A driver must never move a delivery back to pending/assigned themselves
    it.each(["pending", "assigned"])("rejects %s", (status) => {
        expect(deliveryStatusSchema.safeParse({ status }).success).toBe(false);
    });
});

describe("paymentDetailsSchema", () => {
    const payment = { user: "Awa", phone: "+237677123456", orderNumber: "ORD-1", amount: 5000, operator: "OM", locale: "fr" };

    it("accepts a valid payment", () => {
        expect(paymentDetailsSchema.safeParse(payment).success).toBe(true);
    });

    // XAF has no cents
    it.each([0, -100, 99.5])("rejects amount %s", (amount) => {
        expect(paymentDetailsSchema.safeParse({ ...payment, amount }).success).toBe(false);
    });
});

describe("counter typeSchema", () => {
    it("rejects an unknown identifier type", () => {
        expect(typeSchema.safeParse("ORDER").success).toBe(false);
    });
});

describe("promotionCondition", () => {
    it("accepts a known condition type", () => {
        expect(promotionCondition.safeParse({ promotionId: "pr1", type: "promo_code", value: { code: "PIZZA" } }).success).toBe(true);
    });

    it("rejects an unknown condition type", () => {
        expect(promotionCondition.safeParse({ promotionId: "pr1", type: "full_moon", value: {} }).success).toBe(false);
    });
});
