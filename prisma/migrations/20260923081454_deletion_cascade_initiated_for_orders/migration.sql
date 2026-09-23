-- DropForeignKey
ALTER TABLE "deliveries" DROP CONSTRAINT "deliveries_order_number_fkey";

-- DropForeignKey
ALTER TABLE "dine_in_orders" DROP CONSTRAINT "dine_in_orders_order_number_fkey";

-- DropForeignKey
ALTER TABLE "monetbill_transactions" DROP CONSTRAINT "monetbill_transactions_order_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_number_fkey";

-- DropForeignKey
ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_order_number_fkey";

-- DropForeignKey
ALTER TABLE "pickup_orders" DROP CONSTRAINT "pickup_orders_order_number_fkey";

-- DropForeignKey
ALTER TABLE "promotion_usages" DROP CONSTRAINT "promotion_usages_order_number_fkey";

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_orders" ADD CONSTRAINT "pickup_orders_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dine_in_orders" ADD CONSTRAINT "dine_in_orders_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monetbill_transactions" ADD CONSTRAINT "monetbill_transactions_order_payment_id_fkey" FOREIGN KEY ("order_payment_id") REFERENCES "order_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE CASCADE ON UPDATE CASCADE;
