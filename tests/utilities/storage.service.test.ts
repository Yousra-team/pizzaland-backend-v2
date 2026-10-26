import { describe, it, expect, vi, beforeEach } from "vitest";

// A fake Supabase storage bucket
const bucket = vi.hoisted(() => ({
    upload: vi.fn(),
    getPublicUrl: vi.fn(),
    remove: vi.fn(),
}));
vi.mock("../../source/configurations/supabase.js", () => ({
    supabase: { storage: { from: vi.fn(() => bucket) } },
}));

import { uploadImage, deleteImage } from "../../source/utilities/storage.service.js";
import { supabase } from "../../source/configurations/supabase.js";

beforeEach(() => {
    vi.clearAllMocks();
    bucket.upload.mockResolvedValue({ error: null });
    bucket.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }));
    bucket.remove.mockResolvedValue({ error: null });
});

describe("uploadImage", () => {
    it("stores the file at <folder>/<uuid>.<ext> and returns its path and public url", async () => {
        const result = await uploadImage(Buffer.from("img"), "image/png", "products");

        expect(result.path).toMatch(/^products\/[0-9a-f-]{36}\.png$/);
        expect(result.url).toBe(`https://cdn.test/${result.path}`);
        expect(supabase.storage.from).toHaveBeenCalledWith("pizzaland-products-images");
    });

    // upsert: false means a file can never silently replace another one
    it("never overwrites an existing file", async () => {
        await uploadImage(Buffer.from("img"), "image/jpeg", "menus");

        expect(bucket.upload.mock.calls[0][2]).toEqual({ contentType: "image/jpeg", upsert: false });
    });

    it("gives every upload a different path", async () => {
        const a = await uploadImage(Buffer.from("a"), "image/png", "products");
        const b = await uploadImage(Buffer.from("b"), "image/png", "products");

        expect(a.path).not.toBe(b.path);
    });

    it("throws when Supabase refuses the upload", async () => {
        bucket.upload.mockResolvedValue({ error: { message: "bucket full" } });

        await expect(uploadImage(Buffer.from("img"), "image/png", "products")).rejects.toThrow("Upload failed: bucket full");
    });
});

describe("deleteImage", () => {
    it("removes the file at the given path", async () => {
        await deleteImage("products/abc.png");

        expect(bucket.remove).toHaveBeenCalledWith(["products/abc.png"]);
    });

    it("throws when Supabase refuses the delete", async () => {
        bucket.remove.mockResolvedValue({ error: { message: "not found" } });

        await expect(deleteImage("products/abc.png")).rejects.toThrow("Delete failed: not found");
    });
});
