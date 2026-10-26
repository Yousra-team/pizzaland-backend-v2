import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// counter.ts imports prisma at the top. Mocking it stops a real PrismaClient
// from being built just because we imported the file.
const prismaMock = vi.hoisted(() => ({
    counter: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

import { generateIdentifier, CreateIdentifier } from "../../source/utilities/counter.js";

describe("CreateIdentifier", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-24T10:00:00Z")); // 11:00 in Douala
        // create() returns what it was given, like the database would
        prismaMock.counter.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "x", ...data }));
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("starts at 0001 when there is no counter for today", async () => {
        prismaMock.counter.findMany.mockResolvedValue([]);

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261024-0001");
    });

    it("continues from the highest count of today", async () => {
        prismaMock.counter.findMany.mockResolvedValue([
            { type: "DEL", day: 24, count: 1 },
            { type: "DEL", day: 24, count: 3 },
            { type: "DEL", day: 24, count: 2 },
        ]);

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261024-0004");
    });

    it("ignores counters from other days", async () => {
        prismaMock.counter.findMany.mockResolvedValue([{ type: "DEL", day: 23, count: 57 }]);

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261024-0001");
    });

    it("only looks at counters of the same type", async () => {
        prismaMock.counter.findMany.mockResolvedValue([]);

        await CreateIdentifier("PAYMENT");

        expect(prismaMock.counter.findMany).toHaveBeenCalledWith({ where: { type: "PAYMENT" } });
    });

    // 23:30 UTC is already 00:30 the next day in Douala (UTC+1)
    it("uses the Africa/Douala date, not UTC", async () => {
        vi.setSystemTime(new Date("2026-10-24T23:30:00Z"));
        prismaMock.counter.findMany.mockResolvedValue([]);

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261025-0001");
    });

    it("throws for an unknown type and creates nothing", async () => {
        await expect(CreateIdentifier("ORDER")).rejects.toThrow();
        expect(prismaMock.counter.create).not.toHaveBeenCalled();
    });

    // Counter only stores `day`, so on 24 Oct the 24 Sep rows look like "today"
    it("BUG #8: restarts at 0001 on a new date even when the day number is the same", async () => {
        prismaMock.counter.findMany.mockResolvedValue([{ type: "DEL", day: 24, count: 12 }]); // left over from 24 Sep

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261024-0001");
    });
});

describe("generateIdentifier", () => {
    it("builds TYPE-PZ<YYYYMMDD>-<NNNN>", () => {
        expect(generateIdentifier(2026, 10, 24, 1, "DEL")).toBe("DEL-PZ20261024-0001");
    });

    // Without padding, 5 Jan 2026 would come out as "202615" and be ambiguous (15 Jan? 1 May?)
    it("pads month and day to 2 digits", () => {
        expect(generateIdentifier(2026, 1, 5, 12, "CUST")).toBe("CUST-PZ20260105-0012");
    });

    it("pads the count to 4 digits", () => {
        expect(generateIdentifier(2026, 12, 31, 9999, "PAYMENT")).toBe("PAYMENT-PZ20261231-9999");
    });

    // padStart never cuts a longer string, so the 10 000th order of a day still gets a unique id
    it("keeps counts above 9999 instead of cutting them", () => {
        expect(generateIdentifier(2026, 12, 31, 10000, "DINE")).toBe("DINE-PZ20261231-10000");
    });
});
