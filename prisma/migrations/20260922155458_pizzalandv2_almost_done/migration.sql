-- DropForeignKey
ALTER TABLE "deliveries" DROP CONSTRAINT "deliveries_driver_email_fkey";

-- AlterTable
ALTER TABLE "deliveries" ALTER COLUMN "driver_email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "Number" TEXT NOT NULL,
    "Floor ID" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "Name" TEXT NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driver_email_fkey" FOREIGN KEY ("driver_email") REFERENCES "employees"("email") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_Floor ID_fkey" FOREIGN KEY ("Floor ID") REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
