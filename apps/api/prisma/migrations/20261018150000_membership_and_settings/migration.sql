-- AlterTable
ALTER TABLE "members" ADD COLUMN     "current_tier_id" TEXT,
ADD COLUMN     "membership_expires_at" DATE;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "membership_tiers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "duration_months" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "starts_at" DATE NOT NULL,
    "expires_at" DATE,
    "amount_paid" DECIMAL(12,2) NOT NULL,
    "paid_at" DATE NOT NULL,
    "payment_method" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "recorded_by" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,
    "void_reason_encrypted" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_organization_id_id_key" ON "membership_tiers"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_organization_id_name_key" ON "membership_tiers"("organization_id", "name");

-- CreateIndex
CREATE INDEX "memberships_organization_id_member_id_idx" ON "memberships"("organization_id", "member_id");

-- CreateIndex
CREATE INDEX "memberships_organization_id_paid_at_idx" ON "memberships"("organization_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_id_key" ON "memberships"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_member_id_fkey" FOREIGN KEY ("organization_id", "member_id") REFERENCES "members"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_tier_id_fkey" FOREIGN KEY ("organization_id", "tier_id") REFERENCES "membership_tiers"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

