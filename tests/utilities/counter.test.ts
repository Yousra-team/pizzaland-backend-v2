import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// counter.ts imports prisma at the top. Mocking it stops a real PrismaClient
// from being built just because we imported the file.
const prismaMock = vi.hoisted(() => ({
    counter: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

import { generateIdentifier, CreateIdentifier } from "../../source/utilities/counter.js";

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

describe("CreateIdentifier", () => {
    // A tiny fake Counter table. findFirst / findMany filter on type + date and sort by count,
    // like the database would, so the tests check the date logic, not one particular query.
    type Row = { type: string; year: number; month: number; day: number; count: number };
    let rows: Row[];

    const matches = (row: Row, where: any = {}) =>
        Object.entries(where).every(([key, value]) => (row as any)[key] === value);

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-24T10:00:00Z")); // 11:00 in Douala
        vi.spyOn(console, "error").mockImplementation(() => {});

        rows = [];
        prismaMock.counter.findMany.mockImplementation(({ where }: any) => Promise.resolve(rows.filter((r) => matches(r, where))));
        prismaMock.counter.findFirst.mockImplementation(({ where }: any) =>
            Promise.resolve(rows.filter((r) => matches(r, where)).sort((a, b) => b.count - a.count)[0] ?? null));
        prismaMock.counter.create.mockImplementation(({ data }: any) => {
            // @@unique([type, year, month, day, count]): a duplicate is refused like Postgres would
            if (rows.some((r) => matches(r, data))) {
                return Promise.reject(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
            }
            rows.push(data);
            return Promise.resolve({ id: "x", ...data });
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const today = { year: 2026, month: 10, day: 24 };

    it("starts at 0001 when there is no counter for today", async () => {
        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261024-0001");
    });

    it("continues from the highest count of today", async () => {
        rows.push({ type: "DEL", ...today, count: 1 }, { type: "DEL", ...today, count: 3 }, { type: "DEL", ...today, count: 2 });

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261024-0004");
    });

    it("gives consecutive ids to consecutive calls", async () => {
        expect(await CreateIdentifier("ORD")).toBe("ORD-PZ20261024-0001");
        expect(await CreateIdentifier("ORD")).toBe("ORD-PZ20261024-0002");
    });

    it("ignores counters from other days", async () => {
        rows.push({ type: "DEL", ...today, day: 23, count: 57 });

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261024-0001");
    });

    it("keeps a separate count for each type", async () => {
        rows.push({ type: "PAYMENT", ...today, count: 40 });

        expect(await CreateIdentifier("ORD")).toBe("ORD-PZ20261024-0001");
    });

    // regression: was BUG #8 (only `day` was stored, so 24 Oct continued from 24 Sep)
    it("restarts at 0001 on a new month even when the day number is the same", async () => {
        rows.push({ type: "DEL", year: 2026, month: 9, day: 24, count: 12 });

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261024-0001");
    });

    it("restarts at 0001 on a new year with the same month and day", async () => {
        rows.push({ type: "DEL", year: 2025, month: 10, day: 24, count: 12 });

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261024-0001");
    });

    // 23:30 UTC is already 00:30 the next day in Douala (UTC+1)
    it("uses the Africa/Douala date, not UTC", async () => {
        vi.setSystemTime(new Date("2026-10-24T23:30:00Z"));

        expect(await CreateIdentifier("DEL")).toBe("DEL-PZ20261025-0001");
        expect(rows[0]).toMatchObject({ year: 2026, month: 10, day: 25 });
    });

    it("throws for an unknown type and creates nothing", async () => {
        await expect(CreateIdentifier("ORDER")).rejects.toThrow();
        expect(prismaMock.counter.create).not.toHaveBeenCalled();
    });

    // Lunch rush: two requests read the same "latest" count at the same moment, both try to insert
    // count+1, and the unique constraint refuses the second one. Today that error reaches placeOrder
    // and the customer gets a 500. The second request should simply take the next number.
    it("BUG #23: gives a different id instead of failing when a parallel request took the same count", async () => {
        const [a, b] = await Promise.allSettled([CreateIdentifier("ORD"), CreateIdentifier("ORD")]);

        expect(a.status).toBe("fulfilled");
        expect(b.status).toBe("fulfilled");
        const ids = [a, b].map((r) => (r as PromiseFulfilledResult<string>).value);
        expect(new Set(ids).size).toBe(2);
    });
});
