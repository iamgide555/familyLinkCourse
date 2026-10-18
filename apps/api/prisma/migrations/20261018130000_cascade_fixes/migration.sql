-- DropForeignKey
ALTER TABLE "course_runs" DROP CONSTRAINT "course_runs_organization_id_course_id_fkey";

-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_organization_id_member_id_fkey";

-- AddForeignKey
ALTER TABLE "course_runs" ADD CONSTRAINT "course_runs_organization_id_course_id_fkey" FOREIGN KEY ("organization_id", "course_id") REFERENCES "courses"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_organization_id_member_id_fkey" FOREIGN KEY ("organization_id", "member_id") REFERENCES "members"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

