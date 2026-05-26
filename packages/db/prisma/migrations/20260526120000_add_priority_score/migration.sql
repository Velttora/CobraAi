ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "priority_score" INTEGER;

CREATE INDEX IF NOT EXISTS "debts_tenant_id_priority_score_idx"
ON "debts"("tenant_id", "priority_score");
