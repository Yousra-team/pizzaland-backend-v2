import { randomUUID } from "crypto";
import { supabase } from "../configurations/supabase.js";

const BUCKET = "pizzaland-products-images";

export async function uploadImage(
  buffer: Buffer,
  mimetype: string,
  folder: string
) {
  // 1. Build a unique path so two files never overwrite each other
  const ext = mimetype.split("/")[1];               // "image/png" -> "png"
  const path = `${folder}/${randomUUID()}.${ext}`;  // "products/3f2a...png"

  // 2. Upload the bytes
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: false });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // 3. Get the public URL (works because the bucket is public)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return { path, url: data.publicUrl };
}

export async function deleteImage(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}