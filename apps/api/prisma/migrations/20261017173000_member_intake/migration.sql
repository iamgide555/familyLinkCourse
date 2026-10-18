-- AlterTable
ALTER TABLE "members" ADD COLUMN     "birth_date" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "caregiver_member_id" TEXT,
ADD COLUMN     "citizen_id_hash" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "duplicate_review_reason" JSONB,
ADD COLUMN     "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "intake_encrypted" JSONB,
ADD COLUMN     "member_number" TEXT,
ADD COLUMN     "normalized_first_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "normalized_last_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "phone_mobile" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "signed_form_at" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'paper',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "member_sequence" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "members_organization_id_normalized_first_name_normalized_la_idx" ON "members"("organization_id", "normalized_first_name", "normalized_last_name", "birth_date");

-- CreateIndex
CREATE UNIQUE INDEX "members_organization_id_member_number_key" ON "members"("organization_id", "member_number");

-- CreateIndex
CREATE UNIQUE INDEX "members_organization_id_citizen_id_hash_key" ON "members"("organization_id", "citizen_id_hash");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_caregiver_member_id_fkey" FOREIGN KEY ("organization_id", "caregiver_member_id") REFERENCES "members"("organization_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
