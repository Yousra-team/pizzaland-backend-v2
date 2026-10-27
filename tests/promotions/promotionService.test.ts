import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    promotion: { create: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

import { createAPromtion } from "../../source/promotions/promotionService.js";
import { mockReq, mockRes } from "../helpers/http.js";

const promotion = {
    name: "Happy hour",
    description: "Pizzas after work",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    maxUses: 100,
    combinationMode: "AND",
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    prismaMock.promotion.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "promo_1", ...data }));
});

describe("createAPromtion", () => {
    it("answers 400 for an invalid body and creates nothing", async () => {
        const res = mockRes();

        await createAPromtion(mockReq({ body: { ...promotion, combinationMode: "SOMETIMES" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.promotion.create).not.toHaveBeenCalled();
    });

    it("saves the validated promotion, active by default", async () => {
        await createAPromtion(mockReq({ body: promotion }), mockRes());

        expect(prismaMock.promotion.create.mock.calls[0][0].data).toMatchObject({
            name: "Happy hour",
            isActive: true,
            maxUses: 100,
            startDate: new Date("2026-11-01"),
        });
    });

    it("answers 500 when the database fails", async () => {
        prismaMock.promotion.create.mockRejectedValue(new Error("db down"));
        const res = mockRes();

        await createAPromtion(mockReq({ body: promotion }), res);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    // Nothing is sent after promotion.create: the client waits until it times out
    it("BUG #21: answers 201 with the created promotion", async () => {
        const res = mockRes();

        await createAPromtion(mockReq({ body: promotion }), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledTimes(1);
    });
});
