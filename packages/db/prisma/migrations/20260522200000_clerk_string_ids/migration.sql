-- Clerk org/user IDs are strings (org_xxx, user_xxx), not UUIDs.

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_tenant_id_fkey";
ALTER TABLE "portfolios" DROP CONSTRAINT IF EXISTS "portfolios_tenant_id_fkey";
ALTER TABLE "portfolios" DROP CONSTRAINT IF EXISTS "portfolios_created_by_fkey";
ALTER TABLE "debtors" DROP CONSTRAINT IF EXISTS "debtors_tenant_id_fkey";
ALTER TABLE "debts" DROP CONSTRAINT IF EXISTS "debts_tenant_id_fkey";
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_tenant_id_fkey";
ALTER TABLE "promises_to_pay" DROP CONSTRAINT IF EXISTS "promises_to_pay_tenant_id_fkey";
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_tenant_id_fkey";
ALTER TABLE "payment_links" DROP CONSTRAINT IF EXISTS "payment_links_tenant_id_fkey";
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_tenant_id_fkey";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_tenant_id_fkey";
ALTER TABLE "notification_templates" DROP CONSTRAINT IF EXISTS "notification_templates_tenant_id_fkey";
ALTER TABLE "contact_consents" DROP CONSTRAINT IF EXISTS "contact_consents_tenant_id_fkey";
ALTER TABLE "workflow_rules" DROP CONSTRAINT IF EXISTS "workflow_rules_tenant_id_fkey";
ALTER TABLE "workflow_executions" DROP CONSTRAINT IF EXISTS "workflow_executions_tenant_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_tenant_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_user_id_fkey";

ALTER TABLE "tenants" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "tenants" ALTER COLUMN "id" SET DATA TYPE TEXT USING "id"::TEXT;

ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE TEXT USING "id"::TEXT;
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "portfolios" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "portfolios" ALTER COLUMN "created_by" SET DATA TYPE TEXT USING "created_by"::TEXT;

ALTER TABLE "debtors" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "debts" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "contacts" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "promises_to_pay" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "payments" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "payment_links" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "conversations" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "messages" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "notification_templates" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "contact_consents" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "workflow_rules" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "workflow_executions" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "audit_logs" ALTER COLUMN "tenant_id" SET DATA TYPE TEXT USING "tenant_id"::TEXT;
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" SET DATA TYPE TEXT USING "user_id"::TEXT;

ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "debtors" ADD CONSTRAINT "debtors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debts" ADD CONSTRAINT "debts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promises_to_pay" ADD CONSTRAINT "promises_to_pay_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_consents" ADD CONSTRAINT "contact_consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
