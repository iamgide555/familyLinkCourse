-- DropForeignKey
ALTER TABLE "course_service_tags" DROP CONSTRAINT "course_service_tags_organization_id_service_type_id_fkey";

-- AddForeignKey
ALTER TABLE "course_service_tags" ADD CONSTRAINT "course_service_tags_organization_id_service_type_id_fkey" FOREIGN KEY ("organization_id", "service_type_id") REFERENCES "service_types"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

