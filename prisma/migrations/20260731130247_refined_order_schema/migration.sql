/*
  Warnings:

  - Added the required column `order_type` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "orderType" AS ENUM ('dineIn', 'takeOut', 'delivery', 'pickup');

-- AlterTable
ALTER TABLE "dine_in_orders" ALTER COLUMN "table_number" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "order_type" "orderType" NOT NULL;
