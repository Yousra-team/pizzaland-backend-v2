import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    products: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    category: { findUnique: vi.fn(), update: vi.fn() },
    subCategory: { findUnique: vi.fn(), update: vi.fn() },
    addons: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

// Supabase Storage: fake it so no file is ever uploaded or deleted
vi.mock("../../source/utilities/storage.service.js", () => ({ uploadImage: vi.fn(), deleteImage: vi.fn() }));

import {
    createProduct,
    updateProductById,
    updateCategoryById,
    updateSubcategoryById,
    updateAddonsById,
} from "../../source/products/product.service.js";
import { uploadImage, deleteImage } from "../../source/utilities/storage.service.js";
import { mockReq, mockRes } from "../helpers/http.js";

// What multer puts on req.file
const file = { buffer: Buffer.from("img"), mimetype: "image/png" };
const uploaded = { path: "products/new.png", url: "https://cdn.test/products/new.png" };

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(uploadImage).mockResolvedValue(uploaded);
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createProduct", () => {
    // form-data: numbers arrive as strings
    const body = { name: "Pepperoni", description: "Classic", categoryId: "cat_1", price: "4500" };

    it("answers 400 for invalid fields without uploading anything", async () => {
        const res = mockRes();

        await createProduct(mockReq({ body: { ...body, price: "-1" }, file }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it("answers 400 when the image is missing", async () => {
        const res = mockRes();

        await createProduct(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it("answers 400 for invalid variants without uploading anything", async () => {
        const res = mockRes();

        await createProduct(mockReq({ body: { ...body, variants: [{ name: "Large" }] }, file }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it("uploads to the products folder and saves the server-made image url and path", async () => {
        prismaMock.products.create.mockResolvedValue({ id: "p1" });
        const res = mockRes();

        await createProduct(mockReq({ body: { ...body, imageUrl: "https://evil" }, file }), res);

        expect(uploadImage).toHaveBeenCalledWith(file.buffer, "image/png", "products");
        expect(prismaMock.products.create.mock.calls[0][0].data).toMatchObject({
            price: 4500,
            imageUrl: uploaded.url,
            imagePath: uploaded.path,
        });
        expect(res.status).toHaveBeenCalledWith(201);
    });

    // Addons with an id already exist and get linked; addons without one are new
    it("connects existing addons and creates new ones", async () => {
        prismaMock.products.create.mockResolvedValue({ id: "p1" });

        await createProduct(mockReq({
            body: {
                ...body,
                addons: [
                    { id: "a_cheese", name: "Cheese", description: "Extra", price: "500" },
                    { name: "Olives", description: "Black", price: "300" },
                ],
                variants: [{ name: "Large", price: "6500" }],
            },
            file,
        }), mockRes());

        const data = prismaMock.products.create.mock.calls[0][0].data;
        expect(data.addons.connect).toEqual([{ id: "a_cheese" }]);
        expect(data.addons.create).toEqual([{ name: "Olives", description: "Black", price: 300 }]);
        expect(data.variants.create).toEqual([{ name: "Large", price: 6500 }]);
    });

    it("deletes the uploaded image when the database fails", async () => {
        prismaMock.products.create.mockRejectedValue(new Error("db down"));
        const res = mockRes();

        await createProduct(mockReq({ body, file }), res);

        expect(deleteImage).toHaveBeenCalledWith(uploaded.path);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    // Cleanup failures are log-only (CLAUDE.md image upload pattern)
    it("still answers 500 when the cleanup itself fails", async () => {
        prismaMock.products.create.mockRejectedValue(new Error("db down"));
        vi.mocked(deleteImage).mockRejectedValue(new Error("storage down"));
        const res = mockRes();

        await createProduct(mockReq({ body, file }), res);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it("deletes nothing when the upload itself failed", async () => {
        vi.mocked(uploadImage).mockRejectedValue(new Error("upload failed"));
        const res = mockRes();

        await createProduct(mockReq({ body, file }), res);

        expect(deleteImage).not.toHaveBeenCalled();
        expect(prismaMock.products.create).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// All four update handlers follow the same image rules, so the same tests run on each
describe.each([
    ["updateProductById", updateProductById, prismaMock.products, "products", { name: "New name" }],
    ["updateCategoryById", updateCategoryById, prismaMock.category, "categories", { name: "New name" }],
    ["updateSubcategoryById", updateSubcategoryById, prismaMock.subCategory, "subcategories", { name: "New name" }],
    ["updateAddonsById", updateAddonsById, prismaMock.addons, "addons", { name: "New name" }],
])("%s", (_name, handler, model, folder, body) => {
    const req = (withFile: boolean) => mockReq({ params: { id: "id_1" }, body, ...(withFile ? { file } : {}) });

    beforeEach(() => {
        model.findUnique.mockResolvedValue({ id: "id_1", imagePath: "old/old.png" });
        model.update.mockResolvedValue({ id: "id_1" });
    });

    it("answers 404 before uploading when the record does not exist", async () => {
        model.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await handler(req(true), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it(`uploads the new image to "${folder}" and saves it`, async () => {
        const res = mockRes();

        await handler(req(true), res);

        expect(uploadImage).toHaveBeenCalledWith(file.buffer, "image/png", folder);
        expect(model.update.mock.calls[0][0]).toMatchObject({
            where: { id: "id_1" },
            data: { ...body, imageUrl: uploaded.url, imagePath: uploaded.path },
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Delete the old image only AFTER the database points to the new one
    it("deletes the old image only after the update succeeded", async () => {
        await handler(req(true), mockRes());

        expect(deleteImage).toHaveBeenCalledTimes(1);
        expect(deleteImage).toHaveBeenCalledWith("old/old.png");
        expect(model.update.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deleteImage).mock.invocationCallOrder[0]);
    });

    it("deletes the NEW image and keeps the old one when the update fails", async () => {
        model.update.mockRejectedValue(new Error("db down"));
        const res = mockRes();

        await handler(req(true), res);

        expect(deleteImage).toHaveBeenCalledTimes(1);
        expect(deleteImage).toHaveBeenCalledWith(uploaded.path);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it("still answers 200 when deleting the old image fails", async () => {
        vi.mocked(deleteImage).mockRejectedValue(new Error("storage down"));
        const res = mockRes();

        await handler(req(true), res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("touches no storage when no new image is sent", async () => {
        const res = mockRes();

        await handler(req(false), res);

        expect(uploadImage).not.toHaveBeenCalled();
        expect(deleteImage).not.toHaveBeenCalled();
        expect(model.update.mock.calls[0][0].data).toEqual(body);
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe("updateProductById", () => {
    // Moving a product to another category is not an update (schema omits categoryId)
    it("ignores categoryId in the body", async () => {
        prismaMock.products.findUnique.mockResolvedValue({ id: "p1", imagePath: null });
        prismaMock.products.update.mockResolvedValue({ id: "p1" });

        await updateProductById(mockReq({ params: { id: "p1" }, body: { name: "x", categoryId: "cat_2" } }), mockRes());

        expect(prismaMock.products.update.mock.calls[0][0].data).not.toHaveProperty("categoryId");
    });
});
