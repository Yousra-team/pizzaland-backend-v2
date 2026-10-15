import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString, max: 10 });
const prisma = new PrismaClient({ adapter });

export { prisma };

//postgresql://postgres.tnffcetaxdicfuowdgqz:kXDMyDUtvtuBgs3W@aws-1-eu-west-1.pooler.supabase.com:5432/postgres