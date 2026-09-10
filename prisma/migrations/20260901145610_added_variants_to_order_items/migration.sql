-- AlterTable
ALTER TABLE "deliveries" ALTER COLUMN "estimated_delivery_time" DROP NOT NULL;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "addon_id" TEXT,
ADD COLUMN     "product_variant_id" TEXT;

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_items_product_variant_id_idx" ON "order_items"("product_variant_id");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "Addons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
