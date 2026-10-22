import { Request , Response } from "express";
import {prisma} from "../lib/prisma.js"

export const createAPromtion = async (req: Request , res: Response) => {
    try {
         
    } catch (error) {
        res.status(500).json({message:"An internal server error occurred"})
        console.log(error)
    }
};