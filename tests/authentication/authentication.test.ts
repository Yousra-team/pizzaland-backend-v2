import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const prismaMock = vi.hoisted(() => ({
    customers: { findUnique: vi.fn(), create: vi.fn() },
    accounts: { create: vi.fn() },
    employees: { findUnique: vi.fn(), create: vi.fn() },
    token: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

// Twilio OTPs: fake them so no SMS / WhatsApp is ever sent
vi.mock("../../source/notifications/index.js", () => ({
    createVerification: vi.fn(),
    createVerificationCheck: vi.fn(),
    sendMagicLinkToken: vi.fn(),
    sendMagicLinkTokenFR: vi.fn(),
}));
vi.mock("../../source/utilities/counter.js", () => ({ CreateIdentifier: vi.fn() }));

import {
    registerCustomer,
    registerEmployee,
    registerAdmin,
    loginCustomer,
    verifyCustomer,
    loginEmployee,
    loginAdmin,
    refreshAccessToken,
    logout,
} from "../../source/authentication/authentication.js";
import { createVerification, createVerificationCheck } from "../../source/notifications/index.js";
import { CreateIdentifier } from "../../source/utilities/counter.js";
import { comparePassword, hashPassword } from "../../source/authentication/bcrypt.util.js";
import { signRefreshToken, verifyAccessToken } from "../../source/authentication/jwt.util.js";
import { mockReq, mockRes } from "../helpers/http.js";

// Hashing is slow on purpose, so do it once for the whole file
let passwordHash: string;
beforeAll(async () => {
    passwordHash = await hashPassword("secret1");
});

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

const employeeBody = {
    firstName: "Awa",
    lastName: "Ngono",
    email: "awa@yousracompany.com",
    phone: "+237677123456",
    password: "secret1",
    role: "CASHIER",
};

describe("registerCustomer", () => {
    const body = { firstName: "Awa", phone: "+237677123456" };

    it("answers 400 for an invalid body", async () => {
        const res = mockRes();

        await registerCustomer(mockReq({ body: { firstName: "Awa", phone: "677" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.customers.create).not.toHaveBeenCalled();
    });

    it("answers 400 when the phone is already registered", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_1" });
        const res = mockRes();

        await registerCustomer(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.customers.create).not.toHaveBeenCalled();
    });

    it("creates the customer with a counter id and opens an account with 20 coins", async () => {
        prismaMock.customers.findUnique.mockResolvedValue(null);
        vi.mocked(CreateIdentifier).mockResolvedValue("CUST-PZ20261024-0001");
        prismaMock.customers.create.mockResolvedValue({ customerId: "cust_1", ...body });
        const res = mockRes();

        await registerCustomer(mockReq({ body }), res);

        expect(prismaMock.customers.create.mock.calls[0][0].data).toMatchObject({ Id: "CUST-PZ20261024-0001", ...body });
        expect(prismaMock.accounts.create).toHaveBeenCalledWith({ data: { customerId: "cust_1", balance: 20 } });
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("answers 500 and creates nothing when no id could be made", async () => {
        prismaMock.customers.findUnique.mockResolvedValue(null);
        vi.mocked(CreateIdentifier).mockResolvedValue(undefined);
        const res = mockRes();

        await registerCustomer(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(prismaMock.customers.create).not.toHaveBeenCalled();
    });
});

describe("registerEmployee", () => {
    it("answers 400 when the email is taken", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: employeeBody.email });
        const res = mockRes();

        await registerEmployee(mockReq({ body: employeeBody }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.employees.create).not.toHaveBeenCalled();
    });

    // A database leak must never expose real passwords
    it("stores a bcrypt hash, never the plain password", async () => {
        prismaMock.employees.findUnique.mockResolvedValue(null);
        prismaMock.employees.create.mockResolvedValue({});
        const res = mockRes();

        await registerEmployee(mockReq({ body: { ...employeeBody } }), res);

        const saved = prismaMock.employees.create.mock.calls[0][0].data.password;
        expect(saved).not.toBe("secret1");
        expect(await comparePassword("secret1", saved)).toBe(true);
        expect(res.status).toHaveBeenCalledWith(201);
    });
});

describe("registerAdmin", () => {
    const admin = { ...employeeBody, role: "ADMIN" };

    it("answers 400 for a role other than ADMIN", async () => {
        const res = mockRes();

        await registerAdmin(mockReq({ body: { ...employeeBody } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.employees.create).not.toHaveBeenCalled();
    });

    it("answers 400 when the admin already exists", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: admin.email });
        const res = mockRes();

        await registerAdmin(mockReq({ body: { ...admin } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.employees.create).not.toHaveBeenCalled();
    });

    it("creates an admin with a hashed password", async () => {
        prismaMock.employees.findUnique.mockResolvedValue(null);
        prismaMock.employees.create.mockResolvedValue({});
        const res = mockRes();

        await registerAdmin(mockReq({ body: { ...admin } }), res);

        const saved = prismaMock.employees.create.mock.calls[0][0].data;
        expect(saved.role).toBe("ADMIN");
        expect(await comparePassword("secret1", saved.password)).toBe(true);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    // SECURITY: the 403 is sent but the code goes on and creates the admin anyway
    it("BUG #1: refuses emails outside @yousracompany.com and creates nothing", async () => {
        prismaMock.employees.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await registerAdmin(mockReq({ body: { ...admin, email: "hacker@gmail.com" } }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.status).toHaveBeenCalledTimes(1);
        expect(prismaMock.employees.create).not.toHaveBeenCalled();
    });
});

describe("loginCustomer", () => {
    it("answers 400 when the phone is not registered", async () => {
        prismaMock.customers.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await loginCustomer(mockReq({ body: { phone: "+237677123456", channel: "sms" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(createVerification).not.toHaveBeenCalled();
    });

    it.each(["sms", "whatsapp"])("sends the OTP through %s", async (channel) => {
        prismaMock.customers.findUnique.mockResolvedValue({ phone: "+237677123456" });
        const res = mockRes();

        await loginCustomer(mockReq({ body: { phone: "+237677123456", channel } }), res);

        expect(createVerification).toHaveBeenCalledWith("+237677123456", channel);
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe("verifyCustomer", () => {
    const body = { phone: "+237677123456", code: "1234" };

    it("answers 400 without phone or code", async () => {
        const res = mockRes();

        await verifyCustomer(mockReq({ body: { phone: body.phone } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(createVerificationCheck).not.toHaveBeenCalled();
    });

    it("answers 403 and gives no token when the OTP is not approved", async () => {
        vi.mocked(createVerificationCheck).mockResolvedValue({ status: "pending" } as any);
        const res = mockRes();

        await verifyCustomer(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prismaMock.token.create).not.toHaveBeenCalled();
    });

    it("answers 400 when no customer has this phone", async () => {
        vi.mocked(createVerificationCheck).mockResolvedValue({ status: "approved" } as any);
        prismaMock.customers.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await verifyCustomer(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns an access token for the customerId and sets the refresh cookie", async () => {
        vi.mocked(createVerificationCheck).mockResolvedValue({ status: "approved" } as any);
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_1", phone: body.phone });
        const res = mockRes();

        await verifyCustomer(mockReq({ body }), res);

        const { authToken } = res.json.mock.calls[0][0];
        expect(verifyAccessToken(authToken)).toMatchObject({ Id: "cust_1", role: "CUSTOMER" });

        // httpOnly: page JavaScript (and so an XSS attack) can't read the refresh token
        const [name, , options] = res.cookie.mock.calls[0];
        expect(name).toBe("refreshToken");
        expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict" });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // The Token model links to customers through customerId; customerPhone no longer exists
    it("BUG #2: saves the refresh token with the customerId", async () => {
        vi.mocked(createVerificationCheck).mockResolvedValue({ status: "approved" } as any);
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_1", phone: body.phone });

        await verifyCustomer(mockReq({ body }), mockRes());

        const data = prismaMock.token.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ customerId: "cust_1", type: "refreshToken" });
        expect(data).not.toHaveProperty("customerPhone");
    });
});

describe("loginEmployee", () => {
    const body = { email: employeeBody.email, password: "secret1" };

    // Same answer for both cases, so nobody can find out which emails exist
    it("answers the same 400 for an unknown email and a wrong password", async () => {
        prismaMock.employees.findUnique.mockResolvedValue(null);
        const unknown = mockRes();
        await loginEmployee(mockReq({ body }), unknown);

        prismaMock.employees.findUnique.mockResolvedValue({ email: body.email, password: passwordHash, role: "CASHIER" });
        const wrong = mockRes();
        await loginEmployee(mockReq({ body: { ...body, password: "wrong12" } }), wrong);

        expect(unknown.status).toHaveBeenCalledWith(400);
        expect(wrong.status).toHaveBeenCalledWith(400);
        expect(unknown.json.mock.calls[0][0]).toEqual(wrong.json.mock.calls[0][0]);
        expect(prismaMock.token.create).not.toHaveBeenCalled();
    });

    it("returns a token with the employee's email and role, and saves the refresh token", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: body.email, password: passwordHash, role: "CASHIER" });
        const res = mockRes();

        await loginEmployee(mockReq({ body }), res);

        expect(verifyAccessToken(res.json.mock.calls[0][0].authToken)).toMatchObject({ Id: body.email, role: "CASHIER" });
        expect(prismaMock.token.create.mock.calls[0][0].data).toMatchObject({ employeeEmail: body.email, type: "refreshToken" });
        expect(res.cookie.mock.calls[0][2]).toMatchObject({ httpOnly: true });
    });
});

describe("loginAdmin", () => {
    const body = { email: "boss@yousracompany.com", password: "secret1" };

    it("answers 403 for a valid employee who is not an admin", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: body.email, password: passwordHash, role: "MANAGER" });
        const res = mockRes();

        await loginAdmin(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prismaMock.token.create).not.toHaveBeenCalled();
    });

    it("answers 400 for a wrong password", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: body.email, password: passwordHash, role: "ADMIN" });
        const res = mockRes();

        await loginAdmin(mockReq({ body: { ...body, password: "wrong12" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("logs an admin in", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ email: body.email, password: passwordHash, role: "ADMIN" });
        const res = mockRes();

        await loginAdmin(mockReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(verifyAccessToken(res.json.mock.calls[0][0].authToken).role).toBe("ADMIN");
    });
});

describe("refreshAccessToken", () => {
    const refreshToken = signRefreshToken({ Id: "cust_1", role: "CUSTOMER" });
    const future = new Date(Date.now() + 60 * 60 * 1000);

    it("answers 401 without a refresh cookie", async () => {
        const res = mockRes();

        await refreshAccessToken(mockReq(), res);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it("answers 401 for a token that is not a valid refresh JWT", async () => {
        const res = mockRes();

        await refreshAccessToken(mockReq({ cookies: { refreshToken: "garbage" } }), res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(prismaMock.token.findUnique).not.toHaveBeenCalled();
    });

    it.each([
        ["unknown to the database", null],
        ["revoked (after logout)", { revoked: true, expiresAt: future }],
        ["expired in the database", { revoked: false, expiresAt: new Date(Date.now() - 1000) }],
    ])("answers 401 for a token %s", async (_label, stored) => {
        prismaMock.token.findUnique.mockResolvedValue(stored);
        const res = mockRes();

        await refreshAccessToken(mockReq({ cookies: { refreshToken } }), res);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it("returns a new access token for the same user", async () => {
        prismaMock.token.findUnique.mockResolvedValue({ revoked: false, expiresAt: future });
        const res = mockRes();

        await refreshAccessToken(mockReq({ cookies: { refreshToken } }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(verifyAccessToken(res.json.mock.calls[0][0].authToken)).toMatchObject({ Id: "cust_1", role: "CUSTOMER" });
    });
});

describe("logout", () => {
    it("revokes the refresh token and clears the cookie", async () => {
        const res = mockRes();

        await logout(mockReq({ cookies: { refreshToken: "abc" } }), res);

        expect(prismaMock.token.updateMany).toHaveBeenCalledWith({ where: { token: "abc" }, data: { revoked: true } });
        expect(res.clearCookie).toHaveBeenCalledWith("refreshToken");
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("still succeeds without a cookie", async () => {
        const res = mockRes();

        await logout(mockReq(), res);

        expect(prismaMock.token.updateMany).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
