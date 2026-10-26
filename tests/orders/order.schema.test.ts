import { describe, it, expect } from "vitest";
import { createOrderSchema, updateOrderSchema, orderItemSchema } from "../../source/orders/order.schema.js";

const item = { type: "product", productId: "prod_1", quantity: 2 };

describe("orderItemSchema", () => {
    it("accepts a product item", () => {
        expect(orderItemSchema.safeParse(item).success).toBe(true);
    });

    it.each([0, -1, 1.5])("rejects quantity %s", (quantity) => {
        expect(orderItemSchema.safeParse({ ...item, quantity }).success).toBe(false);
    });

    it("rejects an unknown item type", () => {
        expect(orderItemSchema.safeParse({ ...item, type: "drink" }).success).toBe(false);
    });
});

// The discriminated union picks the right object from orderType, then checks only that type's fields
describe("createOrderSchema", () => {
    const pickup = { orderType: "pickup", branchId: "br_1", pickupTime: "2026-10-24T18:00:00Z", items: [item] };
    const dineIn = { orderType: "dineIn", tableId: "tbl_1", items: [item] };
    const delivery = { orderType: "delivery", shippingAddressName: "Bastos", items: [item] };

    it.each([
        ["pickup", pickup],
        ["dineIn", dineIn],
        ["delivery", delivery],
    ])("accepts a valid %s order", (_label, body) => {
        expect(createOrderSchema.safeParse(body).success).toBe(true);
    });

    it("turns the pickupTime string into a Date", () => {
        const result = createOrderSchema.safeParse(pickup);
        expect(result.success && result.data.orderType === "pickup" && result.data.pickupTime).toBeInstanceOf(Date);
    });

    it("rejects a pickup without pickupTime", () => {
        const { pickupTime, ...body } = pickup;
        expect(createOrderSchema.safeParse(body).success).toBe(false);
    });

    it("rejects a pickup without branchId", () => {
        const { branchId, ...body } = pickup;
        expect(createOrderSchema.safeParse(body).success).toBe(false);
    });

    it("rejects a dineIn without tableId", () => {
        const { tableId, ...body } = dineIn;
        expect(createOrderSchema.safeParse(body).success).toBe(false);
    });

    it("rejects a delivery without shippingAddressName", () => {
        const { shippingAddressName, ...body } = delivery;
        expect(createOrderSchema.safeParse(body).success).toBe(false);
    });

    // takeOut was merged into pickup (CLAUDE.md, decision 9)
    it.each(["takeOut", "unknown", undefined])("rejects orderType %s", (orderType) => {
        expect(createOrderSchema.safeParse({ ...pickup, orderType }).success).toBe(false);
    });

    it("rejects an order with no items", () => {
        expect(createOrderSchema.safeParse({ ...pickup, items: [] }).success).toBe(false);
    });

    it("rejects a customerPhone that is not E.164", () => {
        expect(createOrderSchema.safeParse({ ...pickup, customerPhone: "677123456" }).success).toBe(false);
        expect(createOrderSchema.safeParse({ ...pickup, customerPhone: "+237677123456" }).success).toBe(true);
    });
});

describe("updateOrderSchema", () => {
    it("accepts an empty body (the handler rejects it, not the schema)", () => {
        expect(updateOrderSchema.safeParse({}).success).toBe(true);
    });

    it("rejects a negative discount", () => {
        expect(updateOrderSchema.safeParse({ discount: -1 }).success).toBe(false);
    });

    it("rejects an unknown status", () => {
        expect(updateOrderSchema.safeParse({ status: "lost" }).success).toBe(false);
    });

    it("rejects an invalid driver email", () => {
        expect(updateOrderSchema.safeParse({ driverEmail: "driver" }).success).toBe(false);
    });
});
