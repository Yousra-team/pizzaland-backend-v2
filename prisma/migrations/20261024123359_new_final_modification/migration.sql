/*
  Warnings:

  - The values [MONETBIL,PAYPAL] on the enum `paymentMethods` will be removed. If these variants are still used in the database, this will fail.
  - The primary key for the `accounts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `customer_phone` on the `accounts` table. All the data in the column will be lost.
  - You are about to drop the column `customer_phone` on the `addresses` table. All the data in the column will be lost.
  - The primary key for the `customers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `customer_phone` on the `favorites` table. All the data in the column will be lost.
  - You are about to drop the column `cashier_email` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `customer_phone` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `employee_email` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `waitress_email` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `customer_phone` on the `promotion_usages` table. All the data in the column will be lost.
  - You are about to drop the column `customer_phone` on the `reservations` table. All the data in the column will be lost.
  - You are about to drop the column `customer_phone` on the `reviews` table. All the data in the column will be lost.
  - You are about to drop the column `customer_phone` on the `tokens` table. All the data in the column will be lost.
  - You are about to drop the column `customer_phone` on the `user_preferences` table. All the data in the column will be lost.
  - You are about to drop the `monetbill_transactions` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[customer_id]` on the table `accounts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phone]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[customer_id,product_id]` on the table `favorites` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[customer_id,name]` on the table `user_preferences` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customer_id` to the `accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customer_id` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customer_id` to the `customers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customer_id` to the `favorites` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customer_id` to the `promotion_usages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customer_id` to the `reservations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customer_id` to the `reviews` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "countTypes" AS ENUM ('CUST', 'DIN', 'DEL', 'DINE', 'PICKUP', 'YPTS', 'PAYMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConditionType" ADD VALUE 'day_of_the_week';
ALTER TYPE "ConditionType" ADD VALUE 'hour_of_the_day';

-- AlterEnum
BEGIN;
CREATE TYPE "paymentMethods_new" AS ENUM ('CASH', 'ORANGE_MONEY_ONLINE', 'MOMO_ONLINE', 'ORANGE_MERCHANT', 'MOMO_MERCHANT', 'CARD', 'PAYROLL_DEDUCTION', 'YOUSRA_POINTS');
ALTER TABLE "order_payments" ALTER COLUMN "method" TYPE "paymentMethods_new" USING ("method"::text::"paymentMethods_new");
ALTER TYPE "paymentMethods" RENAME TO "paymentMethods_old";
ALTER TYPE "paymentMethods_new" RENAME TO "paymentMethods";
DROP TYPE "public"."paymentMethods_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_customer_phone_fkey";

-- DropForeignKey
ALTER TABLE "addresses" DROP CONSTRAINT "addresses_customer_phone_fkey";

-- DropForeignKey
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_customer_phone_fkey";

-- DropForeignKey
ALTER TABLE "monetbill_transactions" DROP CONSTRAINT "monetbill_transactions_order_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_cashier_email_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_phone_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_employee_email_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_waitress_email_fkey";

-- DropForeignKey
ALTER TABLE "promotion_usages" DROP CONSTRAINT "promotion_usages_customer_phone_fkey";

-- DropForeignKey
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_customer_phone_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_customer_phone_fkey";

-- DropForeignKey
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_customer_phone_fkey";

-- DropForeignKey
ALTER TABLE "user_preferences" DROP CONSTRAINT "user_preferences_customer_phone_fkey";

-- DropIndex
DROP INDEX "accounts_customer_phone_key";

-- DropIndex
DROP INDEX "addresses_customer_phone_idx";

-- DropIndex
DROP INDEX "favorites_customer_phone_product_id_key";

-- DropIndex
DROP INDEX "orders_cashier_email_idx";

-- DropIndex
DROP INDEX "orders_customer_phone_idx";

-- DropIndex
DROP INDEX "orders_employee_email_idx";

-- DropIndex
DROP INDEX "promotion_usages_customer_phone_idx";

-- DropIndex
DROP INDEX "reservations_customer_phone_idx";

-- DropIndex
DROP INDEX "reviews_customer_phone_idx";

-- DropIndex
DROP INDEX "tokens_customer_phone_idx";

-- DropIndex
DROP INDEX "user_preferences_customer_phone_idx";

-- DropIndex
DROP INDEX "user_preferences_customer_phone_name_key";

-- AlterTable
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_pkey",
DROP COLUMN "customer_phone",
ADD COLUMN     "customer_id" TEXT NOT NULL,
ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("customer_id");

-- AlterTable
ALTER TABLE "addresses" DROP COLUMN "customer_phone",
ADD COLUMN     "customer_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "customers" DROP CONSTRAINT "customers_pkey",
ADD COLUMN     "customer_id" TEXT NOT NULL,
ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("customer_id");

-- AlterTable
ALTER TABLE "favorites" DROP COLUMN "customer_phone",
ADD COLUMN     "customer_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "cashier_email",
DROP COLUMN "customer_phone",
DROP COLUMN "employee_email",
DROP COLUMN "waitress_email",
ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "payroll_employee_email" TEXT;

-- AlterTable
ALTER TABLE "promotion_usages" DROP COLUMN "customer_phone",
ADD COLUMN     "customer_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "reservations" DROP COLUMN "customer_phone",
ADD COLUMN     "customer_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "reviews" DROP COLUMN "customer_phone",
ADD COLUMN     "customer_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tokens" DROP COLUMN "customer_phone",
ADD COLUMN     "customer_id" TEXT;

-- AlterTable
ALTER TABLE "user_preferences" DROP COLUMN "customer_phone",
ADD COLUMN     "customer_id" TEXT;

-- DropTable
DROP TABLE "monetbill_transactions";

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "from_status" "orderstatus",
    "to_status" "orderstatus" NOT NULL,
    "changed_by_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_transactions" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "from_customer_id" TEXT,
    "to_customer_id" TEXT,
    "order_number" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "type" "countTypes" NOT NULL,
    "day" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_status_history_order_number_idx" ON "order_status_history"("order_number");

-- CreateIndex
CREATE INDEX "order_status_history_changed_by_email_idx" ON "order_status_history"("changed_by_email");

-- CreateIndex
CREATE INDEX "points_transactions_from_customer_id_idx" ON "points_transactions"("from_customer_id");

-- CreateIndex
CREATE INDEX "points_transactions_to_customer_id_idx" ON "points_transactions"("to_customer_id");

-- CreateIndex
CREATE INDEX "points_transactions_order_number_idx" ON "points_transactions"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_customer_id_key" ON "accounts"("customer_id");

-- CreateIndex
CREATE INDEX "addresses_customer_id_idx" ON "addresses"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_customer_id_product_id_key" ON "favorites"("customer_id", "product_id");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_payroll_employee_email_idx" ON "orders"("payroll_employee_email");

-- CreateIndex
CREATE INDEX "promotion_usages_customer_id_idx" ON "promotion_usages"("customer_id");

-- CreateIndex
CREATE INDEX "reservations_customer_id_idx" ON "reservations"("customer_id");

-- CreateIndex
CREATE INDEX "reviews_customer_id_idx" ON "reviews"("customer_id");

-- CreateIndex
CREATE INDEX "tokens_customer_id_idx" ON "tokens"("customer_id");

-- CreateIndex
CREATE INDEX "user_preferences_customer_id_idx" ON "user_preferences"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_customer_id_name_key" ON "user_preferences"("customer_id", "name");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payroll_employee_email_fkey" FOREIGN KEY ("payroll_employee_email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_email_fkey" FOREIGN KEY ("changed_by_email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_from_customer_id_fkey" FOREIGN KEY ("from_customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_to_customer_id_fkey" FOREIGN KEY ("to_customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
