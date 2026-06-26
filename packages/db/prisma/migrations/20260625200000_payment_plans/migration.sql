-- CreateEnum
CREATE TYPE "payment_plan_status" AS ENUM ('active', 'completed', 'defaulted', 'cancelled');

-- AlterTable
ALTER TABLE "promises_to_pay" ADD COLUMN     "plan_id" UUID,
ADD COLUMN     "installment_number" INTEGER;

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "debt_id" UUID NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "installments_count" INTEGER NOT NULL,
    "status" "payment_plan_status" NOT NULL DEFAULT 'active',
    "created_via" "contact_channel",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_plans_tenant_id_debt_id_idx" ON "payment_plans"("tenant_id", "debt_id");

-- CreateIndex
CREATE INDEX "payment_plans_tenant_id_status_idx" ON "payment_plans"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "promises_to_pay_tenant_id_plan_id_idx" ON "promises_to_pay"("tenant_id", "plan_id");

-- AddForeignKey
ALTER TABLE "promises_to_pay" ADD CONSTRAINT "promises_to_pay_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "payment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
