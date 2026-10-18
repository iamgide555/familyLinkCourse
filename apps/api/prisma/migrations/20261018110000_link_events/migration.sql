-- CreateTable
CREATE TABLE "link_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "from_line_account_id" TEXT,
    "to_line_account_id" TEXT,
    "reason_encrypted" JSONB NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "link_events_organization_id_member_id_created_at_idx" ON "link_events"("organization_id", "member_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "link_events_organization_id_id_key" ON "link_events"("organization_id", "id");

