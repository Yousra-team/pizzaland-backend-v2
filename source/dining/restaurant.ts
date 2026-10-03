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

export const getFloors = async (req: Request, res: Response) => {
    try {
        const floors = await prisma.floor.findMany();
        res.status(200).json({ data: floors });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
        console.log(error);
    }
};

export const getTables = async (req: Request, res: Response) => {
    try {
        const tables = await prisma.table.findMany();
        res.status(200).json({ data: tables });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
        console.log(error);
    }
};

export const updateTable = async (req: Request, res: Response) => {
    try {
        const tableId = req.params.id;
        const result = tableSchema.safeParse(req.body);
        if(!result.success){
            const fieldErros = z.flattenError(result.error).fieldErrors;
             res.status(400).json({ message:"There is a schema error " ,errors: fieldErros });
             return;
        }

        if (!tableId || typeof tableId !== "string") {
            res.status(400).json({ message: "Table ID is required" });
            return;
        }
               
        const updatedTable = await prisma.table.update({
            where: { id: tableId },
            data: result.data,
        });
        res.status(200).json({ message: "Table updated successfully", table: updatedTable });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
        console.log(error);
    }
};

export const updateFloor = async (req: Request, res: Response) => {
    try {
        const floorId = req.params.id;

        const result = floorSchema.safeParse(req.body);
        if(!result.success){
            const fieldErros = z.flattenError(result.error).fieldErrors;
             res.status(400).json({ message:"There is a schema error " ,errors: fieldErros });
             return;
        }

        if (!floorId || typeof floorId !== "string") {
            res.status(400).json({ message: "Floor ID is required" });
            return;
        }

        const updatedFloor = await prisma.floor.update({
            where: { id: floorId },
            data: result.data,
        });
        res.status(200).json({ message: "Floor updated successfully", floor: updatedFloor });
    }
    catch (error) {
        res.status(500).json({ message: "Internal server error" });
        console.log(error);
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