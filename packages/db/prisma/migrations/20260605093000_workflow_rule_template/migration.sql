ALTER TABLE "workflow_rules" ADD COLUMN IF NOT EXISTS "template_id" UUID;

CREATE INDEX IF NOT EXISTS "workflow_rules_template_id_idx"
ON "workflow_rules"("template_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workflow_rules_template_id_fkey'
  ) THEN
    ALTER TABLE "workflow_rules"
      ADD CONSTRAINT "workflow_rules_template_id_fkey"
      FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
