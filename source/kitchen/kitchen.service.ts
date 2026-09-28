import {prisma} from "../lib/prisma.js";
import {Request, Response} from "express";
import { stationSchema , stationSessionSchema } from "./kitchenSchema.js";

// CREATE ENDPOINTS : Create the Kitchen Stations

export const CreatekitchenStation = async(req: Request , res: Response): Promise<void> => {
    try {
        const result = stationSchema.safeParse(req.body);
        if(!result.success) {
            res.status(403).json({message:"Wrong or empty values"})
            return;
        }

        let station = result.data
        const newStation = await prisma.stations.create({
            data:{
            ...station
            },
        });
        res.status(201).json({message: "Station Create Successfully"})

    } catch (error) {
        res.status(500).json({message:"An internal server error occur look closely"})
        console.log("Error Here:", error)
        console.error(error)
    }
};

// UPDATE ENDPOINTS: Update the kitchen station
export const UpdatekitchenStation = async(req: Request , res: Response): Promise<void> => {
    try {
       const id = req.params.id as string
       const updatableFields = stationSchema.omit({
        branchId: true
       }).partial()


        const result = updatableFields.safeParse(req.body);
        if(!result.success) {
            res.status(403).json({message:"Wrong or empty values"})
            return;
        };

        let station = result.data
        const newStation = await prisma.stations.update({
            where: {id},
            data:{
            ...station
            },
        });
        res.status(201).json({message: "Station Updated Successfully"})

    } catch (error) {
        res.status(500).json({message:"An internal server error occurred look closely"})
        console.log("Error Here:", error)
        console.error(error)
    }
};

// GET ENDPOINTS: Fetch the endpoints
export const getKitchenStation = async(req: Request , res: Response): Promise<void> => {
    try{
        const stations = await prisma.stations.findMany();
        res.status(200).json(stations)
    }catch(error){
        res.status(500).json({message:"An internal server error occurred look closely"})
        console.log("Error Here:", error)
        console.error(error)
    }
};