import { prisma } from "../lib/prisma.js";
import { DateTime } from "luxon";
import { typeSchema } from "./counterSchema.js";

export const CreateIdentifier = async (type: string) => {
  try {
    const result = typeSchema.parse(type);
    const dt = DateTime.now().setZone("Africa/Douala");

    // Find the row with the highest count for this type on today's date.
    // orderBy count desc + findFirst = "give me only the top one".
    const latest = await prisma.counter.findFirst({
      where: {
        type: result,
        year: dt.year,
        month: dt.month,
        day: dt.day,
      },
      orderBy: { count: "desc" },
    });

    let count: number;
    if (!latest) {
      count = 1;
    } else {
      count = latest.count + 1;
    }

    const newCounter = await prisma.counter.create({
      data: {
        type: result,
        year: dt.year,
        month: dt.month,
        day: dt.day,
        count: count,
      },
    });

    const identifier = generateIdentifier(
      dt.year,
      dt.month,
      dt.day,
      newCounter.count,
      newCounter.type
    );

    return identifier;
  } catch (error) {
    console.error("Error running CreateIdentifier Workflow", error);
    throw error;
  }
};

export const generateIdentifier = (
  year: number,
  month: number,
  day: number,
  count: number,
  type: string
) => {
  const stringYear = year.toString();
  const stringMonth = month.toString().padStart(2, "0");
  const stringDay = day.toString().padStart(2, "0");
  const stringCount = count.toString().padStart(4, "0");

  const identifier = `${type}-PZ${stringYear}${stringMonth}${stringDay}-${stringCount}`;

  return identifier;
};