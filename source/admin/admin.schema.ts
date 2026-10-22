import * as z from "zod";

export const roles = [ "ADMIN",
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
        "CONTROLLER"] as const;

export  const employeeSchema = z.object({
    firstName: z.string().min(1, "First name is required").max(50, "First name must be at most 50 characters"),
    lastName: z.string().min(1, "Last name is required").max(50, "Last name must be at most 50 characters"),
    email: z.email("Invalid email address"),
    phone: z.e164(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(roles),
    branchId: z.string().optional(),
});

export  const updateEmployeeSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.e164(),
    password: z.string().optional(),
    role: z.enum(roles).optional(),
    branchId: z.string().optional(),
});