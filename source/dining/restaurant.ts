import {prisma} from "../lib/prisma.js";
import { Request , Response } from "express";
import {floorSchema , tableSchema} from "./restaurant.schema.js";
import * as z from "zod";

export const createFloor = async (req: Request, res: Response) => {
    try{
        const result = floorSchema.safeParse(req.body);
        if(!result.success){
            const fieldErros = z.flattenError(result.error).fieldErrors;
             res.status(400).json({ message:"There is a schema error " ,errors: fieldErros });
             return;
        }

        const floor = result.data;

        const newFloor = await prisma.floor.create({
            data: {
              ...floor  
            }
        })
        res.status(201).json({ message: "Floor created successfully", floor: newFloor });
    }catch(error){
        res.status(500).json({ message: "Internal server error" });
        console.log(error)
    }
};

export const createTable = async (req: Request, res: Response) => {
    try{
        const result = tableSchema.safeParse(req.body);
        if(!result.success){
            const fieldErros = z.flattenError(result.error).fieldErrors;
             res.status(400).json({ message:"There is a schema error " ,errors: fieldErros });
             return;
        }

        const table = result.data;

        const newTable = await prisma.table.create({
            data: {
              ...table  
            }
        })
        res.status(201).json({ message: "Table created successfully", table: newTable });
    }catch(error){
        res.status(500).json({ message: "Internal server error" });
        console.log(error)
    }
};