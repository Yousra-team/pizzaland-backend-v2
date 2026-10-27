import * as z from "zod";

// ─── Enum constants (match Prisma enums) ──────────────────────────────────────
// These const arrays are the single source of truth for the enum values.
// Export them so controllers and the engine can import the same list.

export const BenefitType = [
  "percentage_discount",
  "fixed_amount_discount",
  "free_delivery",
  "free_product",
] as const;

export const ConditionType = [
  "promo_code",
  "shipping_address",
  "specific_product",
  "specific_menu",
  "minimum_order_amount",
  "first_time_customers",
  "subcategory",
  "category",
  "product_quantity",
  "day_of_week",
  "hour_of_day",
] as const;

export const CombinationMode = ["AND", "OR", "ANY"] as const;

// ─── Reusable building blocks ─────────────────────────────────────────────────

// Weekday codes — kept here because only day_of_week uses them.
const DayCode = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

// Hour (0–23) and minute (0–59) as plain integers.
// Used by hour_of_day; splitting them out keeps the shape readable.
const hour = z.coerce.number().int().min(0).max(23);
const minute = z.coerce.number().int().min(0).max(59);

// ─── Condition value shapes + per-type condition schemas ──────────────────────
// For each ConditionType we define:
//   1. a value shape — describes the JSON stored in PromotionCondition.value
//   2. a condition schema — pairs the literal `type` with the right value shape
// The discriminated union at the bottom glues all 11 together.

// promo_code — the customer must type a matching code.
const promoCodeValue = z.object({
  code: z.string().min(1),
});
const promoCodeCondition = z.object({
  type: z.literal("promo_code"),
  value: promoCodeValue,
});

// shipping_address — delivery must go to one of the listed addresses.
const shippingAddressValue = z.object({
  shippingAddressNames: z.array(z.string()).min(1),
});
const shippingAddressCondition = z.object({
  type: z.literal("shipping_address"),
  value: shippingAddressValue,
});

// specific_product — cart must contain at least one of these products.
const specificProductValue = z.object({
  productIds: z.array(z.string()).min(1),
});
const specificProductCondition = z.object({
  type: z.literal("specific_product"),
  value: specificProductValue,
});

// specific_menu — cart must contain at least one of these menus.
const specificMenuValue = z.object({
  menuIds: z.array(z.string()).min(1),
});
const specificMenuCondition = z.object({
  type: z.literal("specific_menu"),
  value: specificMenuValue,
});

// minimum_order_amount — subtotal must be ≥ amount (FCFA).
const minimumOrderAmountValue = z.object({
  amount: z.coerce.number().positive(),
});
const minimumOrderAmountCondition = z.object({
  type: z.literal("minimum_order_amount"),
  value: minimumOrderAmountValue,
});

// first_time_customers — customer must have zero prior orders.
// No extra data needed, so the value is just an empty object {}.
const firstTimeCustomersValue = z.object({});
const firstTimeCustomersCondition = z.object({
  type: z.literal("first_time_customers"),
  value: firstTimeCustomersValue,
});

// subcategory — cart must contain items from one of these subcategories.
const subcategoryValue = z.object({
  subCategoryIds: z.array(z.string()).min(1),
});
const subcategoryCondition = z.object({
  type: z.literal("subcategory"),
  value: subcategoryValue,
});

// category — cart must contain items from one of these categories.
const categoryValue = z.object({
  categoryIds: z.array(z.string()).min(1),
});
const categoryCondition = z.object({
  type: z.literal("category"),
  value: categoryValue,
});

// product_quantity — cart must have at least minQuantity of ONE specific product.
const productQuantityValue = z.object({
  productId: z.string(),
  minQuantity: z.coerce.number().int().positive(),
});
const productQuantityCondition = z.object({
  type: z.literal("product_quantity"),
  value: productQuantityValue,
});

// day_of_week — today must be one of the listed days (branch-local time).
const dayOfWeekValue = z.object({
  days: z.array(DayCode).min(1),
});
const dayOfWeekCondition = z.object({
  type: z.literal("day_of_week"),
  value: dayOfWeekValue,
});

// hour_of_day — now must fall within the time window (branch-local time).
// The .refine runs after shape validation to enforce that end > start.
// Overnight windows (end before start) are rejected on purpose — split into
// two promotions if ever needed.
const hourOfDayValue = z
  .object({
    startHour: hour,
    startMinute: minute,
    endHour: hour,
    endMinute: minute,
  })
  .refine(
    (v) => v.endHour * 60 + v.endMinute > v.startHour * 60 + v.startMinute,
    { message: "end time must be after start time (overnight windows not supported)" }
  );
const hourOfDayCondition = z.object({
  type: z.literal("hour_of_day"),
  value: hourOfDayValue,
});

// ─── Benefit value shapes + per-type benefit schemas ──────────────────────────
// Same pattern as conditions, repeated for the four BenefitType values.

// percentage_discount — subtotal × percent / 100, optionally capped by maxDiscount.
const percentageDiscountValue = z.object({
  percent: z.coerce.number().positive().max(100),
  maxDiscount: z.coerce.number().positive().optional(),
});
const percentageDiscountBenefit = z.object({
  type: z.literal("percentage_discount"),
  value: percentageDiscountValue,
});

// fixed_amount_discount — flat amount off (FCFA).
const fixedAmountDiscountValue = z.object({
  amount: z.coerce.number().positive(),
});
const fixedAmountDiscountBenefit = z.object({
  type: z.literal("fixed_amount_discount"),
  value: fixedAmountDiscountValue,
});

// free_delivery — waives the delivery fee. No extra data needed.
// Engine skips this benefit on non-delivery orders (no fee to waive).
const freeDeliveryValue = z.object({});
const freeDeliveryBenefit = z.object({
  type: z.literal("free_delivery"),
  value: freeDeliveryValue,
});

// free_product — adds one product to the order at price 0.
const freeProductValue = z.object({
  productId: z.string(),
  quantity: z.coerce.number().int().positive(),
});
const freeProductBenefit = z.object({
  type: z.literal("free_product"),
  value: freeProductValue,
});

// ─── Public schemas (used by controllers) ─────────────────────────────────────

// The Promotion row itself — created by admin on POST /api/v1/promotions.
// `usedCount` is NOT here: it starts at 0 and is only incremented by the engine.
// Taking it from the client would let admins forge usage counts.
export const promotionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.boolean().default(true),
  maxUses: z.coerce.number().int().positive(),
  combinationMode: z.enum(CombinationMode),
});

// A single condition for a promotion.
// Body of POST /api/v1/promotions/:promotionId/conditions.
// promotionId comes from the URL, NOT the body — never trust it from the client.
// The discriminated union makes Zod pick the right value shape based on `type`.
export const promotionCondition = z.discriminatedUnion("type", [
  promoCodeCondition,
  shippingAddressCondition,
  specificProductCondition,
  specificMenuCondition,
  minimumOrderAmountCondition,
  firstTimeCustomersCondition,
  subcategoryCondition,
  categoryCondition,
  productQuantityCondition,
  dayOfWeekCondition,
  hourOfDayCondition,
]);

// A single benefit for a promotion.
// Body of POST /api/v1/promotions/:promotionId/benefits.
// Same discriminated-union pattern as conditions.
export const promotionBenefit = z.discriminatedUnion("type", [
  percentageDiscountBenefit,
  fixedAmountDiscountBenefit,
  freeDeliveryBenefit,
  freeProductBenefit,
]);