import {prisma} from "../lib/prisma.js";
import { DateTime } from "luxon";
import { typeSchema } from "./counterSchema.js";

export const CreateIdentifier = async (type : string) => {
   try {
        const result = typeSchema.parse(type)
        const existingIdentifiers = await prisma.counter.findMany({
          where :{type : result},
       });

       const dt = DateTime.now().setZone("Africa/Douala")

        let count: number;

       const todaysIdentifiers = existingIdentifiers.filter((item) => { return item.day == dt.day})
       
       if (todaysIdentifiers.length == 0) {
           count = 1;
       } else {
         const counts = todaysIdentifiers.map(item => item.count);
         const highestCount = Math.max(...counts);
         count = highestCount + 1
       }

       const newCounter = await prisma.counter.create({
         data: {
            type : result,
            day: dt.day,
            count: count
         }
       });

       if (!newCounter) {
         console.error("Unable to create a new counter record")
         return undefined;
       }

      const identifier = generateIdentifier (dt.year , dt.month , dt.day , newCounter.count , newCounter.type);

      return identifier;

   } catch (error) {
      console.error("Error running CreateIdentifier Workflow" , error);
      throw error;
   }
};


export const generateIdentifier = (year : number , month: number , day: number , count: number , type: string) => {
   const StringYear : string = year.toString()
   const StringMonth: string = month.toString().padStart(2, "0")
   const StringDay: string = day.toString().padStart(2 , "0")
   const Stringcount: string = count.toString().padStart(4 , "0")

   const identifier = `${type}-PZ${StringYear}${StringMonth}${StringDay}-${Stringcount}`

   return identifier;
}
