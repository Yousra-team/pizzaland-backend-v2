/*
  Warnings:

  - Added the required column `Branch ID` to the `Floor` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Floor" ADD COLUMN     "Branch ID" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "Fee" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_Branch ID_fkey" FOREIGN KEY ("Branch ID") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
