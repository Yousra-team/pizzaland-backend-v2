/*
  Warnings:

  - You are about to drop the column `Number` on the `Table` table. All the data in the column will be lost.
  - You are about to drop the column `table_number` on the `dine_in_orders` table. All the data in the column will be lost.
  - Added the required column `Name` to the `Table` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Table" DROP COLUMN "Number",
ADD COLUMN     "Name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "dine_in_orders" DROP COLUMN "table_number",
ADD COLUMN     "tableId" TEXT;

-- AddForeignKey
ALTER TABLE "dine_in_orders" ADD CONSTRAINT "dine_in_orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
