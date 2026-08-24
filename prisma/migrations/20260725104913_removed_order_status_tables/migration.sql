/*
  Warnings:

  - You are about to drop the `order_statuses` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "order_statuses" DROP CONSTRAINT "order_statuses_order_number_fkey";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "status" "orderstatus" NOT NULL DEFAULT 'pending';

-- DropTable
DROP TABLE "order_statuses";
