import { Request , Response } from "express";
import {prisma} from "../lib/prisma.js"
import { promotionSchema } from "./promotionSchema.js";
import z from "zod";

export const createAPromtion = async (req: Request , res: Response) => {
    try {
          const result = promotionSchema.safeParse(req.body)
          if(!result.success) {
            const fieldErrors = z.flattenError(result.error)
            res.status(400).json({message:" Invalid Request Body"})
            return
          }

          const data = result.data

          const promotion = await prisma.promotion.create({
            data: {
                ...data
            }
          });

          

          
    } catch (error) {
        res.status(500).json({message:"An internal server error occurred"})
        console.log(error)
    }
};