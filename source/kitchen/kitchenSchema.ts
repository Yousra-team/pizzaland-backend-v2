import * as z from "zod";

export const stationSchema = z.object({
   name : z.string(),
   description: z.string(),
   branchId: z.string()
});

export const stationSessionSchema = z.object({
    stationId: z.string(),
    kitchenStaffEmail: z.email(),
    startTime : z.coerce.date(),
    endTime: z.coerce.date(),
});