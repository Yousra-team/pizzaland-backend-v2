import {Request , Response} from "express";
import {prisma} from "../lib/prisma.js"

export const getAllEmployees = async (req: Request , res: Response) => {
    try{
         const employees = await prisma.employees.findMany()
         res.status(200).json(employees);
    }catch(error){
     res.status(500).json({message:"Internal server error"})
     console.log(error)
    }
};