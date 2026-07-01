import upload from "../middlewares/upload";
import { supabase } from "../configurations/supabase";
import { randomUUID } from "crypto";

const uploadImage = async (file: Express.Multer.File) => {

const fileName = `${randomUUID()}-${file.originalname}`;
    const { data, error } = await supabase.storage.from("pizzaland images").upload(fileName, file.buffer, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.mimetype,
    });
    if (error) {
        throw new Error(error.message);
    }
    return data;
};

export default uploadImage;