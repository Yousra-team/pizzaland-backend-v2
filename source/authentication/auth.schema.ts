import * as z from "zod";

export const CustomerSchema = z.object({
    firstName: z.string().min(1).max(25),
    lastName: z.string().min(1).max(50).optional(),
    email: z.email().optional(),
    gender: z.enum(["Male", "Female", "Other"]).optional(),
    phone: z.e164(),
    dateOfBirth: z.coerce.date().optional()
});

export  const employeeSchema = z.object({
    firstName: z.string().min(1, "First name is required").max(50, "First name must be at most 50 characters"),
    lastName: z.string().min(1, "Last name is required").max(50, "Last name must be at most 50 characters"),
    email: z.email("Invalid email address"),
    phone: z.e164(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum([
        "ADMIN",
        "CASHIER",
        "KITCHEN_STAFF",
        "KITCHEN_CHEF",
        "DELIVERY_DRIVER",
        "WAITER",
        "MANAGER",
        "DEVELOPER",
        "MARKETING",
        "HR",
        "FINANCE",
        "CONTROLLER",
    ]),
    branchId: z.string().optional(),
});

export const customerLoginSchema = z.object({
    phone:z.e164(),
});

export const employeeLoginSchema = z.object({
    email : z.email(),
    password : z.string().min(6, "Password must be at least 6 characters"),
})
