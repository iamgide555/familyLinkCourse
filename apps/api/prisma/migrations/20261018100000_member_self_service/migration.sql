-- AlterTable
ALTER TABLE "document_types" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pdpa_requests" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "service_types" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "line_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT '',
    "reachable" BOOLEAN NOT NULL DEFAULT true,
    "rich_menu_state" TEXT NOT NULL DEFAULT 'guest',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signup_invites" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "prefill_encrypted" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "member_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signup_drafts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "owner_kind" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "upload_consent_encrypted" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signup_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "line_account_id" TEXT,
    "invite_id" TEXT,
    "submitted_data_encrypted" JSONB NOT NULL,
    "consents_encrypted" JSONB NOT NULL,
    "candidate_member_ids" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "resolved_member_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "consented_by" TEXT NOT NULL,
    "guardian_name" TEXT NOT NULL DEFAULT '',
    "guardian_relationship" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "user_agent" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "member_id" TEXT,
    "signup_request_id" TEXT,
    "draft_id" TEXT,
    "document_type_id" TEXT,
    "kind" TEXT NOT NULL,
    "file_key_encrypted" JSONB NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_by_kind" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_change_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "line_account_id" TEXT NOT NULL,
    "changes_encrypted" JSONB NOT NULL,
    "base_version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient_kind" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "entity_refs" JSONB NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "dedupe_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_accounts_organization_id_id_key" ON "line_accounts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "line_accounts_organization_id_line_user_id_key" ON "line_accounts"("organization_id", "line_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "signup_invites_token_hash_key" ON "signup_invites"("token_hash");

-- CreateIndex
CREATE INDEX "signup_invites_organization_id_mode_expires_at_idx" ON "signup_invites"("organization_id", "mode", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "signup_invites_organization_id_id_key" ON "signup_invites"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "signup_drafts_token_hash_key" ON "signup_drafts"("token_hash");

-- CreateIndex
CREATE INDEX "signup_drafts_organization_id_owner_kind_owner_id_idx" ON "signup_drafts"("organization_id", "owner_kind", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "signup_drafts_organization_id_id_key" ON "signup_drafts"("organization_id", "id");

-- CreateIndex
CREATE INDEX "signup_requests_organization_id_status_created_at_idx" ON "signup_requests"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "signup_requests_organization_id_line_account_id_status_idx" ON "signup_requests"("organization_id", "line_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "signup_requests_organization_id_id_key" ON "signup_requests"("organization_id", "id");

-- CreateIndex
CREATE INDEX "consents_organization_id_member_id_purpose_created_at_idx" ON "consents"("organization_id", "member_id", "purpose", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "consents_organization_id_id_key" ON "consents"("organization_id", "id");

-- CreateIndex
CREATE INDEX "member_documents_organization_id_member_id_idx" ON "member_documents"("organization_id", "member_id");

-- CreateIndex
CREATE INDEX "member_documents_organization_id_signup_request_id_idx" ON "member_documents"("organization_id", "signup_request_id");

-- CreateIndex
CREATE INDEX "member_documents_organization_id_draft_id_idx" ON "member_documents"("organization_id", "draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_documents_organization_id_id_key" ON "member_documents"("organization_id", "id");

-- CreateIndex
CREATE INDEX "profile_change_requests_organization_id_status_created_at_idx" ON "profile_change_requests"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "profile_change_requests_organization_id_id_key" ON "profile_change_requests"("organization_id", "id");

-- CreateIndex
CREATE INDEX "notifications_organization_id_status_next_attempt_at_idx" ON "notifications"("organization_id", "status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_organization_id_event_id_key" ON "notifications"("organization_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_organization_id_dedupe_key_key" ON "notifications"("organization_id", "dedupe_key");
