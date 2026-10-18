-- CreateTable
CREATE TABLE "case_notes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "author_id" TEXT NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_note_revisions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "case_note_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_note_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_notes_organization_id_member_id_created_at_idx" ON "case_notes"("organization_id", "member_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "case_notes_organization_id_id_key" ON "case_notes"("organization_id", "id");

-- CreateIndex
CREATE INDEX "case_note_revisions_organization_id_case_note_id_version_idx" ON "case_note_revisions"("organization_id", "case_note_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "case_note_revisions_case_note_id_version_key" ON "case_note_revisions"("case_note_id", "version");

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_organization_id_member_id_fkey" FOREIGN KEY ("organization_id", "member_id") REFERENCES "members"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_organization_id_author_id_fkey" FOREIGN KEY ("organization_id", "author_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_note_revisions" ADD CONSTRAINT "case_note_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_note_revisions" ADD CONSTRAINT "case_note_revisions_organization_id_case_note_id_fkey" FOREIGN KEY ("organization_id", "case_note_id") REFERENCES "case_notes"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_note_revisions" ADD CONSTRAINT "case_note_revisions_organization_id_created_by_fkey" FOREIGN KEY ("organization_id", "created_by") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
