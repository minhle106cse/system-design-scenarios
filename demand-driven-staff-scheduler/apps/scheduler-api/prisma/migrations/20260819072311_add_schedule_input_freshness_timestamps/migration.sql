-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "demand_updated_at" TIMESTAMP(3),
ADD COLUMN     "roles_updated_at" TIMESTAMP(3),
ADD COLUMN     "shifts_updated_at" TIMESTAMP(3),
ADD COLUMN     "staff_updated_at" TIMESTAMP(3);
