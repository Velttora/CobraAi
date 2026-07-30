-- Grace period: automation contacts wait until automation_starts_at
ALTER TABLE "portfolios"
  ADD COLUMN IF NOT EXISTS "automation_starts_at" TIMESTAMP(3);

-- Existing automated portfolios keep running (no new grace)
UPDATE "portfolios"
SET "automation_starts_at" = "created_at"
WHERE "automation_status" <> 'none'
  AND "automation_starts_at" IS NULL
  AND "deleted_at" IS NULL;
