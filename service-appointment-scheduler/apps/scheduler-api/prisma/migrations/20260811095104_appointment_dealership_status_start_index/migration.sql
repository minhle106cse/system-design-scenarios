-- CreateIndex
CREATE INDEX "appointments_dealership_id_status_start_at_idx" ON "appointments"("dealership_id", "status", "start_at");
