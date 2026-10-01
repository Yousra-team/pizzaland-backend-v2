-- AlterTable
ALTER TABLE "order_payments" ALTER COLUMN "provider" DROP DEFAULT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "Guest Name" TEXT,
ADD COLUMN     "Guest Phone" TEXT;
