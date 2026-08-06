-- CreateEnum
CREATE TYPE "negotiation_status" AS ENUM ('open', 'agreed', 'rejected', 'escalated', 'expired');

-- CreateTable
CREATE TABLE "negotiation_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "portfolio_id" UUID,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "max_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "max_installments" INTEGER NOT NULL DEFAULT 1,
    "min_down_payment_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "min_acceptable_npv_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "annual_discount_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.24,
    "max_term_days" INTEGER NOT NULL DEFAULT 180,
    "max_rounds" INTEGER NOT NULL DEFAULT 3,
    "offer_validity_hours" INTEGER NOT NULL DEFAULT 72,
    "eligible_segments" JSONB NOT NULL DEFAULT '[]',
    "auto_close_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "negotiation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "debt_id" UUID NOT NULL,
    "debtor_id" UUID NOT NULL,
    "conversation_id" UUID,
    "policy_id" UUID,
    "status" "negotiation_status" NOT NULL DEFAULT 'open',
    "round" INTEGER NOT NULL DEFAULT 0,
    "channel" "contact_channel",
    "baseline_npv" DECIMAL(15,2),
    "offer_settlement_amount" DECIMAL(15,2),
    "offer_down_payment" DECIMAL(15,2),
    "offer_installments" INTEGER,
    "offer_interval_days" INTEGER,
    "offer_first_payment_days" INTEGER,
    "offer_discount_pct" DECIMAL(5,2),
    "offer_npv" DECIMAL(15,2),
    "offer_expires_at" TIMESTAMP(3),
    "agreement_hash" TEXT,
    "agreed_at" TIMESTAMP(3),
    "plan_id" UUID,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "negotiation_policies_tenant_id_portfolio_id_key" ON "negotiation_policies"("tenant_id", "portfolio_id");

-- CreateIndex
CREATE INDEX "negotiation_policies_tenant_id_is_active_idx" ON "negotiation_policies"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "negotiations_tenant_id_debt_id_idx" ON "negotiations"("tenant_id", "debt_id");

-- CreateIndex
CREATE INDEX "negotiations_tenant_id_debtor_id_idx" ON "negotiations"("tenant_id", "debtor_id");

-- CreateIndex
CREATE INDEX "negotiations_tenant_id_status_idx" ON "negotiations"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "negotiation_policies" ADD CONSTRAINT "negotiation_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_policies" ADD CONSTRAINT "negotiation_policies_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_debtor_id_fkey" FOREIGN KEY ("debtor_id") REFERENCES "debtors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "negotiation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "payment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
