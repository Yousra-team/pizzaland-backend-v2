import { describe, it, expect } from "vitest";
import { ProductSchema, MenuSchema, ProductVariantSchema } from "../../source/products/product.schema.js";

// form-data sends every value as a string, so numbers must be coerced (CLAUDE.md)
describe("ProductSchema", () => {
    const product = { name: "Pepperoni", description: "Classic", categoryId: "cat_1", price: "4500" };

    it("coerces a price sent as a string", () => {
        const result = ProductSchema.safeParse(product);
        expect(result.success && result.data.price).toBe(4500);
    });

    it.each(["0", "-100", "abc"])("rejects price %s", (price) => {
        expect(ProductSchema.safeParse({ ...product, price }).success).toBe(false);
    });

    it("rejects a preparationTime that is not a whole number", () => {
        expect(ProductSchema.safeParse({ ...product, preparationTime: "7.5" }).success).toBe(false);
    });

    // image fields are never accepted from the client, the server sets them after upload
    it("drops imageUrl and imagePath sent by the client", () => {
        const result = ProductSchema.safeParse({ ...product, imageUrl: "https://evil", imagePath: "x" });
        expect(result.success && result.data).not.toHaveProperty("imageUrl");
        expect(result.success && result.data).not.toHaveProperty("imagePath");
    });
});

describe("ProductVariantSchema", () => {
    it("coerces a variant price sent as a string", () => {
        const result = ProductVariantSchema.safeParse({ name: "Large", price: "6500" });
        expect(result.success && result.data.price).toBe(6500);
    });
});

describe("MenuSchema", () => {
    const menu = {
        name: "Family",
        description: "2 pizzas",
        price: "12000",
        categoryId: "cat_1",
        subCategoryId: "sub_1",
        MenuItems: [{ productId: "p1", quantity: "2" }],
    };

    it("accepts a menu and coerces its numbers", () => {
        const result = MenuSchema.safeParse(menu);
        expect(result.success && result.data.price).toBe(12000);
        expect(result.success && result.data.MenuItems[0].quantity).toBe(2);
    });

    it("rejects a menu item quantity of 0", () => {
        expect(MenuSchema.safeParse({ ...menu, MenuItems: [{ productId: "p1", quantity: 0 }] }).success).toBe(false);
    });

    it("requires subCategoryId", () => {
        const { subCategoryId, ...body } = menu;
        expect(MenuSchema.safeParse(body).success).toBe(false);
    });
});
