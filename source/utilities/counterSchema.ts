import * as z from "zod";

export const countEnums = ["CUST", "DIN", "DEL" ,"DINE" ,"PICKUP" , "YPTS" , "PAYMENT"] as const;

export const typeSchema = z.enum(countEnums)