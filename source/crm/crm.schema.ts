import * as z from 'zod';

export const PREFERENCE_NAMES = [
  "preferredPaymentMethod",
  "preferredDeliveryAddress",
  "preferredLanguage",
  "preferredCurrency",
  "favoriteCategory",
  "favoriteSubcategory",
  "favoriteProduct",
  "favoriteMenu",
  "notificationPreferences",
  "marketingOptIn",
] as const;




// `verified` is not here on purpose: only the server decides if a customer is verified
export const customerSchema = z.object({
  firstName: z.string().min(1, { message: 'First name is required' }),
  lastName: z.string().min(1).optional(),
  email: z.email({ message: 'Invalid email address' }).optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional(), // must match the Prisma Gender enum
  dateOfBirth: z.coerce.date().optional(), // JSON sends dates as strings, coerce turns them into Date
});

// customerPhone is never in these schemas: it comes from the logged-in user's token
export const favoriteSchema = z.object({
  productId: z.string(),
});

export const reviewSchema = z.object({
  productId: z.string(),
  rating: z.coerce.number().int().min(1).max(5), // rating is an Int column, so 4.5 is rejected
  comment: z.string().optional(),
});

export const accountSchema = z.object({
  customerPhone: z.e164(),
  balance: z.number().min(0),
  password: z.string().min(4).max(20),
});

// Used by credit/debit: amount must be strictly positive
export const accountMovementSchema = z.object({
  customerPhone: z.e164(),
  amount: z.number().positive(),
});

// The owner (customer or employee) comes from the token, so only name and value are sent
export const userPreferenceSchema = z.object({
  name: z.enum(PREFERENCE_NAMES, { message: 'Invalid preference name' }),
  value: z.string().min(1, { message: 'Preference value is required' }),
});
