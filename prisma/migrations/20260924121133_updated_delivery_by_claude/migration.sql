-- CreateIndex
CREATE INDEX "deliveries_driver_email_status_idx" ON "deliveries"("driver_email", "status");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");
