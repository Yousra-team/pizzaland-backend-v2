/*
  Warnings:

  - The values [delivered,cancelled] on the enum `OrderItemStatus` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `type` to the `order_items` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "orderItemType" AS ENUM ('addons', 'menu', 'product');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderItemStatus_new" AS ENUM ('pending', 'preparing', 'in_station', 'out_of_station', 'ready', 'complete');
ALTER TABLE "order_items" ALTER COLUMN "status" TYPE "OrderItemStatus_new" USING ("status"::text::"OrderItemStatus_new");
ALTER TYPE "OrderItemStatus" RENAME TO "OrderItemStatus_old";
ALTER TYPE "OrderItemStatus_new" RENAME TO "OrderItemStatus";
DROP TYPE "public"."OrderItemStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "type" "orderItemType" NOT NULL;

-- CreateTable
CREATE TABLE "Addons" (
    "id" TEXT NOT NULL,
    "ERP Code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AddonsToProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AddonsToProducts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Addons_name_idx" ON "Addons"("name");

-- CreateIndex
CREATE INDEX "_AddonsToProducts_B_index" ON "_AddonsToProducts"("B");

-- AddForeignKey
ALTER TABLE "_AddonsToProducts" ADD CONSTRAINT "_AddonsToProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "Addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AddonsToProducts" ADD CONSTRAINT "_AddonsToProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
