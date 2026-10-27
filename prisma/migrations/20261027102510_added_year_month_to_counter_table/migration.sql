/*
  Warnings:

  - A unique constraint covering the columns `[type,year,month,day,count]` on the table `Counter` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `month` to the `Counter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `Counter` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Counter" ADD COLUMN     "month" INTEGER NOT NULL,
ADD COLUMN     "year" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Counter_type_year_month_day_count_key" ON "Counter"("type", "year", "month", "day", "count");
