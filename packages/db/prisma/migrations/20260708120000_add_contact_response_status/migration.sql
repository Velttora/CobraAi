-- CreateEnum
CREATE TYPE "contact_response_status" AS ENUM ('pending', 'effective', 'no_response');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "response_status" "contact_response_status" NOT NULL DEFAULT 'pending';
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "responded_at" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "attempt_number" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contacts_tenant_id_debtor_id_response_status_idx"
ON "contacts"("tenant_id", "debtor_id", "response_status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contacts_response_status_status_idx"
ON "contacts"("response_status", "status");

-- Backfill: derive response_status for existing rows from their outcome, since these
-- attempts predate response tracking and we have no other signal of debtor engagement.
UPDATE "contacts"
SET "response_status" = 'effective', "responded_at" = COALESCE("ended_at", "updated_at")
WHERE "outcome" IN ('promise_made', 'payment_received', 'callback_requested', 'refused');

UPDATE "contacts"
SET "response_status" = 'no_response'
WHERE "outcome" IN ('no_answer', 'voicemail', 'wrong_number')
   OR ("status" IN ('completed', 'failed') AND "outcome" IS NULL);
