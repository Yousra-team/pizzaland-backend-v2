/*
  Warnings:

  - Changed the type of `status` on the `order_payments` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "paymentStatus" AS ENUM ('pending', 'paid', 'cancelled');

-- AlterTable
ALTER TABLE "order_payments" DROP COLUMN "status",
ADD COLUMN     "status" "paymentStatus" NOT NULL;
