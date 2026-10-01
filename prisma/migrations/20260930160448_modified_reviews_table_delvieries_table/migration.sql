-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_product_id_fkey";

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "Details" TEXT;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "deliveryId" TEXT,
ADD COLUMN     "orderNumber" TEXT,
ALTER COLUMN "product_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_orderNumber_fkey" FOREIGN KEY ("orderNumber") REFERENCES "orders"("number") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
