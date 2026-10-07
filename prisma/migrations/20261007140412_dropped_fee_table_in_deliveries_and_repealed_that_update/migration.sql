/*
  Warnings:

  - You are about to drop the column `Fee` on the `deliveries` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "deliveries" DROP COLUMN "Fee";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "waitress_email" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_waitress_email_fkey" FOREIGN KEY ("waitress_email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;
