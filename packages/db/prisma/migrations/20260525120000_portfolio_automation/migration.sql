-- CreateEnum
CREATE TYPE "portfolio_automation_status" AS ENUM ('none', 'package', 'custom');

-- AlterTable
ALTER TABLE "portfolios"
ADD COLUMN "automation_status" "portfolio_automation_status" NOT NULL DEFAULT 'none',
ADD COLUMN "active_package_slug" TEXT;

-- AlterTable
ALTER TABLE "workflow_rules"
ADD COLUMN "portfolio_id" UUID;

-- CreateTable
CREATE TABLE "portfolio_package_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "package_slug" TEXT,
    "action" TEXT NOT NULL,
    "applied_by" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_package_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolios_tenant_id_automation_status_idx" ON "portfolios"("tenant_id", "automation_status");

-- CreateIndex
CREATE INDEX "workflow_rules_tenant_id_portfolio_id_is_active_idx" ON "workflow_rules"("tenant_id", "portfolio_id", "is_active");

-- CreateIndex
CREATE INDEX "portfolio_package_applications_tenant_id_portfolio_id_created_at_idx" ON "portfolio_package_applications"("tenant_id", "portfolio_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_package_applications" ADD CONSTRAINT "portfolio_package_applications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_package_applications" ADD CONSTRAINT "portfolio_package_applications_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_package_applications" ADD CONSTRAINT "portfolio_package_applications_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
