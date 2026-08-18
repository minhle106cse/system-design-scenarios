-- CreateTable
CREATE TABLE "staff_unavailability" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "staff_unavailability_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "staff_unavailability" ADD CONSTRAINT "staff_unavailability_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
