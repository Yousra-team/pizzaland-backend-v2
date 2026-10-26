import { vi } from "vitest";
import { Request, Response } from "express";

// A fake Express request: only the parts our handlers read
export const mockReq = (overrides: Record<string, any> = {}): Request => {
    return {
        body: {},
        params: {},
        query: {},
        headers: {},
        cookies: {},
        ...overrides,
    } as unknown as Request;
};

// A fake Express response. Every method records its calls and returns res,
// so chains like res.status(400).json({...}) work like the real thing.
export const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    res.cookie = vi.fn().mockReturnValue(res);
    res.clearCookie = vi.fn().mockReturnValue(res);
    return res as Response & {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;
        cookie: ReturnType<typeof vi.fn>;
        clearCookie: ReturnType<typeof vi.fn>;
    };
};
