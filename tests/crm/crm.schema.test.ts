import { describe, it, expect } from "vitest";
import { reviewSchema, sendYousraCoinsSchema, userPreferenceSchema, creditSchema } from "../../source/crm/crm.schema.js";

describe("reviewSchema", () => {
    it.each([1, 5])("accepts rating %s", (rating) => {
        expect(reviewSchema.safeParse({ productId: "p1", rating }).success).toBe(true);
    });

    // rating is an Int column, so 4.5 must not reach the database
    it.each([0, 6, 4.5])("rejects rating %s", (rating) => {
        expect(reviewSchema.safeParse({ productId: "p1", rating }).success).toBe(false);
    });

    it("coerces a rating sent as a string", () => {
        const result = reviewSchema.safeParse({ productId: "p1", rating: "4" });
        expect(result.success && result.data.rating).toBe(4);
    });
});

describe("sendYousraCoinsSchema", () => {
    const body = { customerPhone: "+237677123456", amount: 10, format: "yousra" };

    it("accepts a valid transfer", () => {
        expect(sendYousraCoinsSchema.safeParse(body).success).toBe(true);
    });

    it.each([0, -5])("rejects amount %s", (amount) => {
        expect(sendYousraCoinsSchema.safeParse({ ...body, amount }).success).toBe(false);
    });

    it("rejects an unknown format", () => {
        expect(sendYousraCoinsSchema.safeParse({ ...body, format: "usd" }).success).toBe(false);
    });

    it("rejects a phone that is not E.164", () => {
        expect(sendYousraCoinsSchema.safeParse({ ...body, customerPhone: "677123456" }).success).toBe(false);
    });
});

describe("creditSchema", () => {
    it.each([0, -1])("rejects amount %s", (amount) => {
        expect(creditSchema.safeParse({ customerId: "c1", amount }).success).toBe(false);
    });
});

describe("userPreferenceSchema", () => {
    it("accepts a known preference name", () => {
        expect(userPreferenceSchema.safeParse({ name: "preferredLanguage", value: "fr" }).success).toBe(true);
    });

    it("rejects an unknown preference name", () => {
        expect(userPreferenceSchema.safeParse({ name: "shoeSize", value: "42" }).success).toBe(false);
    });

    it("rejects an empty value", () => {
        expect(userPreferenceSchema.safeParse({ name: "preferredLanguage", value: "" }).success).toBe(false);
    });
});
