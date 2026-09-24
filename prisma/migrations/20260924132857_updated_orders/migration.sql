-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_phone_fkey";

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "customer_phone" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE SET NULL ON UPDATE CASCADE;
