-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_roles" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_role_requirements" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "min_count" INTEGER NOT NULL,

    CONSTRAINT "shift_role_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_schedule_id_name_key" ON "roles"("schedule_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "staff_roles_staff_id_role_id_key" ON "staff_roles"("staff_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_role_requirements_shift_id_role_id_key" ON "shift_role_requirements"("shift_id", "role_id");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_role_requirements" ADD CONSTRAINT "shift_role_requirements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_role_requirements" ADD CONSTRAINT "shift_role_requirements_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
