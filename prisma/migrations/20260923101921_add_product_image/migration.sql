/*
  Warnings:

  - You are about to drop the column `ERP Code` on the `Addons` table. All the data in the column will be lost.
  - You are about to drop the column `manager_email` on the `branches` table. All the data in the column will be lost.
  - You are about to drop the column `image_public_id` on the `categories` table. All the data in the column will be lost.
  - You are about to drop the column `image_url` on the `categories` table. All the data in the column will be lost.
  - You are about to drop the column `image_public_id` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `image_url` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `category_id` on the `sub_categories` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `sub_categories` table. All the data in the column will be lost.
  - You are about to drop the column `image_public_id` on the `sub_categories` table. All the data in the column will be lost.
  - You are about to drop the column `image_url` on the `sub_categories` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `sub_categories` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[Manager Email]` on the table `branches` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `CATEGORY ID` to the `sub_categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `UPDATED AT` to the `sub_categories` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "branches" DROP CONSTRAINT "branches_manager_email_fkey";

-- DropForeignKey
ALTER TABLE "sub_categories" DROP CONSTRAINT "sub_categories_category_id_fkey";

-- DropIndex
DROP INDEX "branches_manager_email_key";

-- AlterTable
ALTER TABLE "Addons" DROP COLUMN "ERP Code",
ADD COLUMN     "Image Path" TEXT,
ADD COLUMN     "Image URL" TEXT;

-- AlterTable
ALTER TABLE "branches" DROP COLUMN "manager_email",
ADD COLUMN     "Manager Email" TEXT;

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "image_public_id",
DROP COLUMN "image_url",
ADD COLUMN     "Image Path" TEXT,
ADD COLUMN     "Image URL" TEXT;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "image_public_id",
DROP COLUMN "image_url",
ADD COLUMN     "Image Path" TEXT,
ADD COLUMN     "Image URL" TEXT;

-- AlterTable
ALTER TABLE "sub_categories" DROP COLUMN "category_id",
DROP COLUMN "created_at",
DROP COLUMN "image_public_id",
DROP COLUMN "image_url",
DROP COLUMN "updated_at",
ADD COLUMN     "CATEGORY ID" TEXT NOT NULL,
ADD COLUMN     "CREATED AT" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "Image PATH" TEXT,
ADD COLUMN     "Image URL" TEXT,
ADD COLUMN     "UPDATED AT" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "branches_Manager Email_key" ON "branches"("Manager Email");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_Manager Email_fkey" FOREIGN KEY ("Manager Email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_categories" ADD CONSTRAINT "sub_categories_CATEGORY ID_fkey" FOREIGN KEY ("CATEGORY ID") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
