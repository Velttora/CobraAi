-- D-12: split the legacy PaymentGateway enum (method + provider conflated)
-- into a dedicated `provider` column and an optional `method` column on
-- payment_links and payments. Backfill mapping is measured against the
-- local dev DB and recorded in
-- .planning/phases/08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro/08-PAYMENT-GATEWAY-DISTRIBUTION.md.
-- The legacy `gateway` column and `payment_gateway` enum are retained,
-- read-only, as the audit trail this backfill was derived from.

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('stripe', 'wompi', 'payu', 'epayco', 'mercadopago', 'external_link', 'transfer');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('card', 'pse', 'nequi', 'bancolombia_transfer', 'cash', 'bank_transfer', 'pix', 'spei');

-- AlterTable: add nullable columns first so the backfill below can run.
ALTER TABLE "payment_links" ADD COLUMN "provider" "payment_provider", ADD COLUMN "method" "payment_method";
ALTER TABLE "payments" ADD COLUMN "provider" "payment_provider", ADD COLUMN "method" "payment_method";

-- Backfill payment_links: one UPDATE per legacy gateway value, guarded by
-- `AND provider IS NULL` so re-running this migration is a no-op.
UPDATE "payment_links" SET "provider" = 'mercadopago', "method" = NULL WHERE "gateway" = 'mercadopago' AND provider IS NULL;
UPDATE "payment_links" SET "provider" = 'transfer', "method" = NULL WHERE "gateway" = 'conekta' AND provider IS NULL;
UPDATE "payment_links" SET "provider" = 'transfer', "method" = 'bank_transfer' WHERE "gateway" = 'transfer' AND provider IS NULL;
UPDATE "payment_links" SET "provider" = 'transfer', "method" = 'pse' WHERE "gateway" = 'pse' AND provider IS NULL;
UPDATE "payment_links" SET "provider" = 'transfer', "method" = 'card' WHERE "gateway" = 'card' AND provider IS NULL;
UPDATE "payment_links" SET "provider" = 'transfer', "method" = 'cash' WHERE "gateway" = 'cash' AND provider IS NULL;
UPDATE "payment_links" SET "provider" = 'transfer', "method" = 'pix' WHERE "gateway" = 'pix' AND provider IS NULL;
UPDATE "payment_links" SET "provider" = 'transfer', "method" = 'spei' WHERE "gateway" = 'spei' AND provider IS NULL;

-- Backfill payments: same mapping as payment_links.
UPDATE "payments" SET "provider" = 'mercadopago', "method" = NULL WHERE "gateway" = 'mercadopago' AND provider IS NULL;
UPDATE "payments" SET "provider" = 'transfer', "method" = NULL WHERE "gateway" = 'conekta' AND provider IS NULL;
UPDATE "payments" SET "provider" = 'transfer', "method" = 'bank_transfer' WHERE "gateway" = 'transfer' AND provider IS NULL;
UPDATE "payments" SET "provider" = 'transfer', "method" = 'pse' WHERE "gateway" = 'pse' AND provider IS NULL;
UPDATE "payments" SET "provider" = 'transfer', "method" = 'card' WHERE "gateway" = 'card' AND provider IS NULL;
UPDATE "payments" SET "provider" = 'transfer', "method" = 'cash' WHERE "gateway" = 'cash' AND provider IS NULL;
UPDATE "payments" SET "provider" = 'transfer', "method" = 'pix' WHERE "gateway" = 'pix' AND provider IS NULL;
UPDATE "payments" SET "provider" = 'transfer', "method" = 'spei' WHERE "gateway" = 'spei' AND provider IS NULL;

-- Defensive catch-all: no row may survive with a null provider, regardless
-- of what the legacy enum actually contained.
UPDATE "payment_links" SET "provider" = 'transfer' WHERE "provider" IS NULL;
UPDATE "payments" SET "provider" = 'transfer' WHERE "provider" IS NULL;

-- Assert the backfill was complete. If either fails, the backfill was
-- wrong and this migration must not be marked applied.
ALTER TABLE "payment_links" ALTER COLUMN "provider" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "provider" SET NOT NULL;
