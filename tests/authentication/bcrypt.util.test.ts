import { describe, it, expect } from "vitest";
import { hashPassword, comparePassword } from "../../source/authentication/bcrypt.util.js";

// bcrypt itself is not ours to test: one round trip proves the wrapper is wired correctly
describe("hashPassword / comparePassword", () => {
    it("hashes the password and only matches the right one", async () => {
        const hash = await hashPassword("secret1");

        expect(hash).not.toBe("secret1");
        expect(await comparePassword("secret1", hash)).toBe(true);
        expect(await comparePassword("wrong", hash)).toBe(false);
    });
});
