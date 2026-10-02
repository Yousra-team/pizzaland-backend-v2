import * as z from "zod";

export const tableSchema = z.object({
  name : z.string(),
  floorId: z.string(),
  capacity: z.number().int().min(1),
});

export const floorSchema = z.object({
  name: z.string(),
  branchId: z.string()
});