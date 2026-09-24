-- DropForeignKey
ALTER TABLE "menus" DROP CONSTRAINT "menus_category_id_fkey";

-- DropForeignKey
ALTER TABLE "menus" DROP CONSTRAINT "menus_sub_category_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_product_id_fkey";

-- DropIndex
DROP INDEX "favorites_customer_phone_idx";

-- DropIndex
DROP INDEX "menus_category_id_idx";

-- DropIndex
DROP INDEX "menus_sub_category_id_idx";

-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "menus" DROP COLUMN "category_id",
DROP COLUMN "created_at",
DROP COLUMN "image_public_id",
DROP COLUMN "image_url",
DROP COLUMN "preparation_time",
DROP COLUMN "sub_category_id",
DROP COLUMN "updated_at",
ADD COLUMN     "CATEGORY ID" TEXT NOT NULL,
ADD COLUMN     "CREATED AT" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "Image Path" TEXT,
ADD COLUMN     "Image URL" TEXT,
ADD COLUMN     "Preparation Time min" INTEGER,
ADD COLUMN     "SUB CATEGORY ID" TEXT NOT NULL,
ADD COLUMN     "UPDATED AT" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "product_variants";

-- CreateTable
CREATE TABLE "Product Variants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "product_id" TEXT NOT NULL,
    "CREATED AT" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UPDATED AT" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product Variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product Variants_product_id_idx" ON "Product Variants"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_customer_phone_product_id_key" ON "favorites"("customer_phone", "product_id");

-- CreateIndex
CREATE INDEX "menus_CATEGORY ID_idx" ON "menus"("CATEGORY ID");

-- CreateIndex
CREATE INDEX "menus_SUB CATEGORY ID_idx" ON "menus"("SUB CATEGORY ID");

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_CATEGORY ID_fkey" FOREIGN KEY ("CATEGORY ID") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_SUB CATEGORY ID_fkey" FOREIGN KEY ("SUB CATEGORY ID") REFERENCES "sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product Variants" ADD CONSTRAINT "Product Variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "Product Variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

