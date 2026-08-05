-- CreateEnum
CREATE TYPE "integration_provider" AS ENUM ('twilio_whatsapp', 'twilio_voice', 'sendgrid', 'stripe', 'wompi', 'payu', 'epayco', 'mercadopago', 'external_link', 'transfer');

-- CreateEnum
CREATE TYPE "integration_mode" AS ENUM ('managed', 'byo');

-- CreateEnum
CREATE TYPE "integration_status" AS ENUM ('not_configured', 'verifying', 'verified', 'failed', 'pending_dns', 'pending_meta');

-- CreateTable
CREATE TABLE "tenant_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "provider" "integration_provider" NOT NULL,
    "mode" "integration_mode" NOT NULL DEFAULT 'managed',
    "status" "integration_status" NOT NULL DEFAULT 'not_configured',
    "public_config" JSONB NOT NULL DEFAULT '{}',
    "secrets_cipher" BYTEA,
    "secrets_meta" JSONB NOT NULL DEFAULT '{}',
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "webhook_token" TEXT,
    "verified_at" TIMESTAMP(3),
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_integrations_tenant_id_provider_key" ON "tenant_integrations"("tenant_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_integrations_webhook_token_key" ON "tenant_integrations"("webhook_token");

-- CreateIndex
CREATE INDEX "tenant_integrations_tenant_id_status_idx" ON "tenant_integrations"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;
