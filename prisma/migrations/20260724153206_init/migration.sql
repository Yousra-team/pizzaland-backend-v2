-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CASHIER', 'KITCHEN_STAFF', 'KITCHEN_CHEF', 'DELIVERY_DRIVER', 'WAITER', 'MANAGER', 'DEVELOPER', 'MARKETING', 'HR', 'FINANCE', 'CONTROLLER');

-- CreateEnum
CREATE TYPE "paymentMethods" AS ENUM ('CASH', 'MONETBIL', 'CARD', 'PAYPAL', 'PAYROLL_DEDUCTION');

-- CreateEnum
CREATE TYPE "BenefitType" AS ENUM ('percentage_discount', 'fixed_amount_discount', 'free_delivery', 'free_product');

-- CreateEnum
CREATE TYPE "ConditionType" AS ENUM ('promo_code', 'shipping_address', 'specific_product', 'specific_menu', 'minimum_order_amount', 'first_time_customers', 'subcategory', 'category', 'product_quantity');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female', 'Other');

-- CreateEnum
CREATE TYPE "CombinationMode" AS ENUM ('AND', 'OR', 'ANY');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('pending', 'preparing', 'ready', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "orderstatus" AS ENUM ('pending', 'kitchen', 'confirmed', 'preparing', 'ready', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'assigned', 'in_transit', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('pending', 'confirmed', 'seated', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "tokenType" AS ENUM ('refreshToken', 'verificationToken', 'passwordresetToken', 'sessionToken');

-- CreateEnum
CREATE TYPE "preferenceName" AS ENUM ('preferredPaymentMethod', 'preferredDeliveryAddress', 'preferredLanguage', 'preferredCurrency', 'favoriteCategory', 'favoriteSubcategory', 'favoriteProduct', 'favoriteMenu', 'notificationPreferences', 'marketingOptIn');

-- CreateTable
CREATE TABLE "customers" (
    "phone" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "email" TEXT,
    "gender" "Gender",
    "date_of_birth" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "customer_phone" TEXT,
    "employee_email" TEXT,
    "name" "preferenceName" NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "token" TEXT NOT NULL,
    "customer_phone" TEXT,
    "employee_email" TEXT,
    "employee_role" "Role",
    "type" "tokenType" NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "accounts" (
    "customer_phone" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "password" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("customer_phone")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "shipping_address_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "branch_id" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "manager_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT,
    "image_public_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT,
    "image_public_id" TEXT,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT NOT NULL,
    "sub_category_id" TEXT,
    "station_id" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "image_url" TEXT,
    "image_public_id" TEXT,
    "popularity" INTEGER,
    "preparation_time" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "category_id" TEXT NOT NULL,
    "sub_category_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_public_id" TEXT NOT NULL,
    "preparation_time" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_sessions" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "kitchen_staff_email" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "station_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_addresses" (
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "delivery_fee" DOUBLE PRECISION NOT NULL,
    "delivery_time" INTEGER NOT NULL,
    "branch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_addresses_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "orders" (
    "number" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cashier_email" TEXT,
    "customer_phone" TEXT NOT NULL,
    "employee_email" TEXT,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "product_id" TEXT,
    "menu_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "status" "OrderItemStatus" NOT NULL,
    "estimated_ready_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "driver_email" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "estimated_delivery_time" TIMESTAMP(3) NOT NULL,
    "actual_delivery_time" TIMESTAMP(3),
    "shipping_address_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "pickup_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dine_in_orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "table_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dine_in_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_statuses" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "value" "orderstatus" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payments" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "paymentMethods" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MonetBill',
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monetbill_transactions" (
    "id" TEXT NOT NULL,
    "order_payment_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "transaction_uuid" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_number" TEXT NOT NULL,
    "message" TEXT,
    "mccmc" TEXT,
    "operator" TEXT,
    "operator_code" TEXT,
    "operator_transaction_id" TEXT,
    "sign" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monetbill_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "reservation_date" TIMESTAMP(3) NOT NULL,
    "reservation_time" TIMESTAMP(3) NOT NULL,
    "comments" TEXT,
    "branch_id" TEXT NOT NULL,
    "number_of_people" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "max_uses" INTEGER NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "combination_mode" "CombinationMode" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_conditions" (
    "id" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "type" "ConditionType" NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_benefits" (
    "id" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "type" "BenefitType" NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_usages" (
    "id" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "user_preferences_customer_phone_idx" ON "user_preferences"("customer_phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_customer_phone_name_key" ON "user_preferences"("customer_phone", "name");

-- CreateIndex
CREATE INDEX "tokens_customer_phone_idx" ON "tokens"("customer_phone");

-- CreateIndex
CREATE INDEX "tokens_employee_email_idx" ON "tokens"("employee_email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_customer_phone_key" ON "accounts"("customer_phone");

-- CreateIndex
CREATE INDEX "addresses_customer_phone_idx" ON "addresses"("customer_phone");

-- CreateIndex
CREATE INDEX "favorites_customer_phone_idx" ON "favorites"("customer_phone");

-- CreateIndex
CREATE INDEX "favorites_product_id_idx" ON "favorites"("product_id");

-- CreateIndex
CREATE INDEX "reviews_customer_phone_idx" ON "reviews"("customer_phone");

-- CreateIndex
CREATE INDEX "reviews_product_id_idx" ON "reviews"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_phone_key" ON "employees"("phone");

-- CreateIndex
CREATE INDEX "employees_branch_id_idx" ON "employees"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_manager_email_key" ON "branches"("manager_email");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_sub_category_id_idx" ON "products"("sub_category_id");

-- CreateIndex
CREATE INDEX "products_station_id_idx" ON "products"("station_id");

-- CreateIndex
CREATE INDEX "menus_category_id_idx" ON "menus"("category_id");

-- CreateIndex
CREATE INDEX "menus_sub_category_id_idx" ON "menus"("sub_category_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "menu_items_menu_id_idx" ON "menu_items"("menu_id");

-- CreateIndex
CREATE INDEX "menu_items_product_id_idx" ON "menu_items"("product_id");

-- CreateIndex
CREATE INDEX "stations_branch_id_idx" ON "stations"("branch_id");

-- CreateIndex
CREATE INDEX "station_sessions_station_id_idx" ON "station_sessions"("station_id");

-- CreateIndex
CREATE INDEX "station_sessions_kitchen_staff_email_idx" ON "station_sessions"("kitchen_staff_email");

-- CreateIndex
CREATE INDEX "shipping_addresses_branch_id_idx" ON "shipping_addresses"("branch_id");

-- CreateIndex
CREATE INDEX "orders_customer_phone_idx" ON "orders"("customer_phone");

-- CreateIndex
CREATE INDEX "orders_cashier_email_idx" ON "orders"("cashier_email");

-- CreateIndex
CREATE INDEX "orders_branch_id_idx" ON "orders"("branch_id");

-- CreateIndex
CREATE INDEX "orders_employee_email_idx" ON "orders"("employee_email");

-- CreateIndex
CREATE INDEX "order_items_order_number_idx" ON "order_items"("order_number");

-- CreateIndex
CREATE INDEX "deliveries_order_number_idx" ON "deliveries"("order_number");

-- CreateIndex
CREATE INDEX "pickup_orders_order_number_idx" ON "pickup_orders"("order_number");

-- CreateIndex
CREATE INDEX "dine_in_orders_order_number_idx" ON "dine_in_orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "order_statuses_order_number_key" ON "order_statuses"("order_number");

-- CreateIndex
CREATE INDEX "order_payments_order_number_idx" ON "order_payments"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "monetbill_transactions_order_payment_id_key" ON "monetbill_transactions"("order_payment_id");

-- CreateIndex
CREATE INDEX "reservations_customer_phone_idx" ON "reservations"("customer_phone");

-- CreateIndex
CREATE INDEX "reservations_branch_id_idx" ON "reservations"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_name_key" ON "promotions"("name");

-- CreateIndex
CREATE INDEX "promotion_conditions_promotion_id_idx" ON "promotion_conditions"("promotion_id");

-- CreateIndex
CREATE INDEX "promotion_benefits_promotion_id_idx" ON "promotion_benefits"("promotion_id");

-- CreateIndex
CREATE INDEX "promotion_usages_promotion_id_idx" ON "promotion_usages"("promotion_id");

-- CreateIndex
CREATE INDEX "promotion_usages_order_number_idx" ON "promotion_usages"("order_number");

-- CreateIndex
CREATE INDEX "promotion_usages_customer_phone_idx" ON "promotion_usages"("customer_phone");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_employee_email_fkey" FOREIGN KEY ("employee_email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_employee_email_fkey" FOREIGN KEY ("employee_email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_shipping_address_name_fkey" FOREIGN KEY ("shipping_address_name") REFERENCES "shipping_addresses"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_manager_email_fkey" FOREIGN KEY ("manager_email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_categories" ADD CONSTRAINT "sub_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "sub_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_sessions" ADD CONSTRAINT "station_sessions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_sessions" ADD CONSTRAINT "station_sessions_kitchen_staff_email_fkey" FOREIGN KEY ("kitchen_staff_email") REFERENCES "employees"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_addresses" ADD CONSTRAINT "shipping_addresses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cashier_email_fkey" FOREIGN KEY ("cashier_email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_employee_email_fkey" FOREIGN KEY ("employee_email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driver_email_fkey" FOREIGN KEY ("driver_email") REFERENCES "employees"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_shipping_address_name_fkey" FOREIGN KEY ("shipping_address_name") REFERENCES "shipping_addresses"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_orders" ADD CONSTRAINT "pickup_orders_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dine_in_orders" ADD CONSTRAINT "dine_in_orders_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_statuses" ADD CONSTRAINT "order_statuses_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monetbill_transactions" ADD CONSTRAINT "monetbill_transactions_order_payment_id_fkey" FOREIGN KEY ("order_payment_id") REFERENCES "order_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_conditions" ADD CONSTRAINT "promotion_conditions_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_benefits" ADD CONSTRAINT "promotion_benefits_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "orders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_customer_phone_fkey" FOREIGN KEY ("customer_phone") REFERENCES "customers"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;
