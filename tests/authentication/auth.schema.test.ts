import { describe, it, expect } from "vitest";
import { employeeSchema, customerLoginSchema, CustomerSchema } from "../../source/authentication/auth.schema.js";

describe("employeeSchema", () => {
    const employee = {
        firstName: "Awa",
        lastName: "Ngono",
        email: "awa@yousracompany.com",
        phone: "+237677123456",
        password: "secret1",
        role: "CASHIER",
    };

    it("accepts a valid employee", () => {
        expect(employeeSchema.safeParse(employee).success).toBe(true);
    });

    it("rejects a password shorter than 6 characters", () => {
        expect(employeeSchema.safeParse({ ...employee, password: "12345" }).success).toBe(false);
    });

    // CUSTOMER is not an employee role: an employee must never get a customer token role
    it.each(["CUSTOMER", "SUPERADMIN", "cashier"])("rejects role %s", (role) => {
        expect(employeeSchema.safeParse({ ...employee, role }).success).toBe(false);
    });
});

describe("customerLoginSchema", () => {
    it.each(["sms", "whatsapp"])("accepts channel %s", (channel) => {
        expect(customerLoginSchema.safeParse({ phone: "+237677123456", channel }).success).toBe(true);
    });

    it("rejects an unknown channel", () => {
        expect(customerLoginSchema.safeParse({ phone: "+237677123456", channel: "email" }).success).toBe(false);
    });
});

describe("CustomerSchema", () => {
    it("coerces dateOfBirth into a Date", () => {
        const result = CustomerSchema.safeParse({ firstName: "Awa", phone: "+237677123456", dateOfBirth: "2000-01-31" });
        expect(result.success && result.data.dateOfBirth).toBeInstanceOf(Date);
    });

    it("rejects a first name longer than 25 characters", () => {
        expect(CustomerSchema.safeParse({ firstName: "a".repeat(26), phone: "+237677123456" }).success).toBe(false);
    });
});
