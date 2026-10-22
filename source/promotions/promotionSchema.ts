import * as z from "zod";

export const BenefitType = ["percentage_discount" , "fixed_amount_discount" , "free_delivery" , "free_product"] as const;
export const ConditionType = ["promo_code","shipping_address", "specific_product", "specific_menu","minimum_order_amount", "first_time_customers" , "subcategory", "category", "product_quantity","day_of_week", "hour_of_day"]  as const
export const CombinationMode = ["AND","OR","ANY"] as const;

const hour = z.coerce.number().int().min(0).max(23);
const minute = z.coerce.number().int().min(0).max(59);

const hourOfDayValue = z.object({
  startHour: hour,
  startMinute: minute,
  endHour: hour,
  endMinute: minute,
}).refine(
  (v) => (v.endHour * 60 + v.endMinute) > (v.startHour * 60 + v.startMinute),
  { message: "end time must be after start time (overnight windows not supported)" }
);

const hourOfDayCondition = z.object({
  type: z.literal("hour_of_day"),
  value: hourOfDayValue,
});

const DayCode = z.enum(["MON", "TUE" , "WED" , "THU" , "FRI" , "SAT" , "SUN"])

const minimumOrderAmountValue = z.object({
    amount: z.coerce.number().positive(),
});

const minimumOrderAmountCondition = z.object({
    type: z.literal("minimum_order_amount"),
    value: minimumOrderAmountValue
});

const promoCodeValue = z.object({
   code: z.string().min(1),
});

const promoCodeCondition = z.object({
    type: z.literal("promo_code"),
    value: promoCodeValue, 
});


const shippingAddressValue = z.object({
   shippingAddressNames: z.array(z.string()).min(1),
});

const shippingAddressCondtion = z.object({
    type: z.literal("shipping_address"),
    value: shippingAddressValue,
});

const specificProductValue = z.object({
    productIds: z.array(z.string()).min(1),
});

const specificProductCondition = z.object({
    type: z.literal("specific_product"),
    value: specificProductValue,
});

const specificMenuValue = z.object({
    menuIds: z.array(z.string()).min(1),
});

const specificMenuCondition = z.object({
    type: z.literal("specific_menu"),
    value: specificMenuValue,
});

const dayofWeekValue = z.object({
    days: z.array(DayCode).min(1),
});

const dayOfWeekCondition = z.object({
    type: z.literal("day_of_week"),
    value: dayofWeekValue,
});

const firstTimeCustomerValue = z.object({});
const firstTimeCustomerCondition = z.object({
    type: z.literal("first_time_customers"),
    value: firstTimeCustomerValue
});

const subcategoryValue = z.object({
    subCategoryIds: z.array(z.string()).min(1),
});

const subCategoryCondition = z.object({
    type: z.literal("subcategory"),
    value: subcategoryValue
});

const categoryValue = z.object({
    categoryIds: z.array(z.string()).min(1)
});

const categoryCondition = z.object({
    type: z.literal("category"),
    value: categoryValue
});

const productValue = z.object({
    productId: z.array(z.string()).min(1),
    minQuantity: z.coerce.number().int().positive().min(1)
});

const productQuantityCondition = z.object({
    type: z.literal("product_quantity"),
    value: productValue
});

export const promotionSchema = z.object({
    name : z.string(),
    description: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isActive: z.boolean(),
    maxUses:  z.coerce.number().int().positive(),
    CombinationMode: z.enum(CombinationMode)
});

export const PromotionBenefit = z.object({
    promotionId: z.string(),
    type: z.enum(BenefitType),
    value: z.json(),
});

export const PromotionUsage = z.object({
    promotionId: z.string(),
    orderNumber: z.string(),
    customerPhone: z.string(),
});

export const promotionCondition = z.object({
    promotionId : z.string(),
    type: z.enum(ConditionType),
    value: z.json(),
});
