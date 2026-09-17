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




export const customerSchema = z.object({
  firstName: z.string().min(1, { message: 'First name is required' }),
  lastName: z.string().min(1, { message: 'Last name is required' }),
  email: z.email({ message: 'Invalid email address' }),
  gender: z.enum(['male', 'female', 'other']),
  dateOfBirth: z.date().optional(),
  verified: z.boolean().default(false),
});

export const favoriteSchema = z.object({
  customerPhone: z.e164(),
  productId: z.string(),
});

export const reviewSchema = z.object({
  customerPhone: z.e164(),
  productId: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

export const accountSchema = z.object({
  customerPhone: z.e164(),
  balance: z.number().min(0),
  password: z.string().min(4).max(20),
});

export const userPreferenceSchema = z.object({
  customerPhone: z.e164(),
  employeeEmail: z.email(),
  name: z.enum(PREFERENCE_NAMES, { message: 'Invalid preference name' }),
  value: z.string().min(1, { message: 'Preference value is required' }),
}); 