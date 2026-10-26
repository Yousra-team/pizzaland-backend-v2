import * as z from "zod";

export const methods = [ "CASH",
  "ORANGE_MONEY_ONLINE",
  "MOMO_ONLINE",
  "ORANGE_MERCHANT",
  "MOMO_MERCHANT",
  "CARD",
  "PAYROLL_DEDUCTION",
  "YOUSRA_POINTS"
] as const;

export const paymentStatuses = ["pending", "paid","cancelled"]

export const paymentDetailsSchema = z.object({
    user : z.string(),
    phone : z.e164(),
    orderNumber : z.string(),
    amount: z.number().int().positive(),
    operator: z.string(), // make it an enum later
    locale: z.string(), // make it an enum later
});

export const isMyOrderPaidSchema = z.object({
   orderNumber : z.string()
});

export const notifyPaymentSchema = z.object({
   service : z.string(),
   amount : z.number().int().positive(),
   status: z.string(),
   payment_ref: z.string()
});

export const methodSchema = z.enum(methods)

export const paymentSchema = z.object({
   orderNumber : z.string(),
   amount : z.number().int().positive(),
   method: methodSchema,
   provider: z.string(),
});