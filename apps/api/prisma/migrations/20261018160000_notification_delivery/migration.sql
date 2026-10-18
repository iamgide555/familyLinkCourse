-- AlterTable
ALTER TABLE "line_accounts" ADD COLUMN     "rich_menu_synced_state" TEXT NOT NULL DEFAULT 'guest',
ADD COLUMN     "unfollowed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "items" JSONB,
ADD COLUMN     "last_error_code" TEXT,
ADD COLUMN     "lease_expires_at" TIMESTAMP(3),
ADD COLUMN     "lease_owner" TEXT,
ADD COLUMN     "line_account_id" TEXT,
ADD COLUMN     "parent_id" TEXT,
ADD COLUMN     "provider_id" TEXT,
ADD COLUMN     "target_date" TEXT;

