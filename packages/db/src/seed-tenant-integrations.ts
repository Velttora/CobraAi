import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { IntegrationProvider, Tenant } from "@prisma/client";
import { encryptSecretBundle, lastFour } from "@cobrai/utils/crypto";
import { loadSeedEnv } from "./load-seed-env";

/**
 * One-time cutover seed (D-18): copies the platform's current global
 * credentials into per-tenant `TenantIntegration` rows for every tenant that
 * already exists, so nothing stops sending the moment the adapters switch to
 * per-tenant resolution (plan 08-09). New tenants deliberately start empty —
 * this script only ever touches tenants that exist at the time it runs.
 *
 * Ships as a TypeScript data migration rather than a `.sql` migration file
 * (the repo's usual reference-data pattern, e.g.
 * `20260714130000_seed_colombia_holidays/migration.sql`) because the rows
 * must carry AES-256-GCM ciphertext, and a `.sql` file can neither read
 * `process.env` nor run the cipher. Structurally follows
 * `backfill-escalations.ts`.
 */

const prisma = new PrismaClient();

/**
 * Providers this seed writes that are webhook-capable, mirroring
 * `WEBHOOK_CAPABLE_PROVIDERS` from `@cobrai/integrations`. Duplicated, not
 * imported: `@cobrai/integrations` depends on `@cobrai/db`, so importing it
 * back here would create a circular workspace dependency.
 */
const SEED_WEBHOOK_CAPABLE_PROVIDERS: IntegrationProvider[] = ["twilio_whatsapp", "sendgrid", "mercadopago"];

/** Domain already in production use for the reply-to of every outbound email (see `email.constants.ts`). */
const REPLY_DOMAIN = "reply.fogging.org";

type SeedTenant = Pick<Tenant, "id" | "settings">;

interface TwilioEnv {
  accountSid: string;
  authToken: string;
  waFrom: string | null;
}

interface SendgridEnv {
  apiKey: string;
  fromEmail: string | null;
}

interface MercadopagoEnv {
  accessToken: string;
  webhookSecret: string | null;
}

export interface SeedEnv {
  twilio: TwilioEnv | null;
  sendgrid: SendgridEnv | null;
  mercadopago: MercadopagoEnv | null;
  vapiPhoneNumberId: string | null;
}

export interface SeedResult {
  provider: IntegrationProvider;
  result: "created" | "skipped";
}

/** Reads and groups the global provider credentials from `process.env`, logging a notice for every absent group. */
export function loadProviderEnv(): SeedEnv {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const twilio =
    accountSid && authToken
      ? { accountSid, authToken, waFrom: process.env["TWILIO_WA_FROM"] ?? process.env["TWILIO_FROM_NUMBER"] ?? null }
      : null;
  if (!twilio) {
    console.info(
      "Twilio no configurado (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN ausentes): se omiten twilio_whatsapp y twilio_voice."
    );
  }

  const sendgridApiKey = process.env["SENDGRID_API_KEY"];
  const sendgrid = sendgridApiKey
    ? { apiKey: sendgridApiKey, fromEmail: process.env["SENDGRID_FROM_EMAIL"] ?? null }
    : null;
  if (!sendgrid) {
    console.info("SendGrid no configurado (SENDGRID_API_KEY ausente): se omite sendgrid.");
  }

  const mpAccessToken = process.env["MP_ACCESS_TOKEN"];
  const mercadopago = mpAccessToken
    ? { accessToken: mpAccessToken, webhookSecret: process.env["MP_WEBHOOK_SECRET"] ?? null }
    : null;
  if (!mercadopago) {
    console.info("Mercado Pago no configurado (MP_ACCESS_TOKEN ausente): se omite mercadopago.");
  }

  return { twilio, sendgrid, mercadopago, vapiPhoneNumberId: process.env["VAPI_PHONE_NUMBER_ID"] ?? null };
}

/**
 * Resolves the tenant's WhatsApp `from` number the same way
 * `twilio-whatsapp.adapter.ts` does: the tenant's own
 * `settings.whatsappFromNumber` (already carries the `whatsapp:` prefix,
 * normalized on write by `tenant.service.ts`) wins over the platform's
 * global number, which gets the prefix applied here.
 */
function resolveWhatsappFromNumber(tenant: SeedTenant, envFrom: string | null): string | null {
  const settings = (tenant.settings ?? {}) as { whatsappFromNumber?: unknown };
  if (typeof settings.whatsappFromNumber === "string" && settings.whatsappFromNumber) {
    return settings.whatsappFromNumber;
  }
  if (!envFrom) return null;
  return envFrom.startsWith("whatsapp:") ? envFrom : `whatsapp:${envFrom}`;
}

/** Redacted per-field metadata persisted alongside the ciphertext — never the plaintext value. */
function buildSecretsMeta(secrets: Record<string, string>): Record<string, { lastFour: string; savedAt: string }> {
  const savedAt = new Date().toISOString();
  const meta: Record<string, { lastFour: string; savedAt: string }> = {};
  for (const [field, value] of Object.entries(secrets)) {
    meta[field] = { lastFour: lastFour(value), savedAt };
  }
  return meta;
}

/**
 * Creates a `TenantIntegration` row for `(tenantId, provider)` only when none
 * exists yet — the application-level equivalent of the repo's
 * `ON CONFLICT ... DO NOTHING` migration idiom (see
 * `20260714130000_seed_colombia_holidays/migration.sql`). Deliberately a
 * `findUnique` followed by a plain `create`, never a single combined write: a
 * combined write would silently overwrite a tenant's own manually configured
 * credentials, which is the one thing this script must never do.
 * `findUnique` on the compound key also reports a soft-deleted row as
 * existing, since `deletedAt` is not part of the unique index — this script
 * never resurrects or touches a disconnected integration either.
 *
 * `status: "verified"` is set directly and deliberately: these are the
 * credentials the platform is successfully sending with right now, so
 * re-verifying them against the providers at seed time would add failure
 * modes without adding information.
 */
async function insertIfMissing(
  client: PrismaClient,
  tenantId: string,
  provider: IntegrationProvider,
  publicConfig: Record<string, string>,
  secrets: Record<string, string>
): Promise<"created" | "skipped"> {
  const existing = await client.tenantIntegration.findUnique({
    where: { tenantId_provider: { tenantId, provider } }
  });
  if (existing) return "skipped";

  const { ciphertext, keyVersion } = encryptSecretBundle(secrets);

  await client.tenantIntegration.create({
    data: {
      tenantId,
      provider,
      mode: "managed",
      status: "verified",
      publicConfig,
      secretsCipher: ciphertext,
      secretsMeta: buildSecretsMeta(secrets),
      keyVersion,
      webhookToken: SEED_WEBHOOK_CAPABLE_PROVIDERS.includes(provider) ? randomBytes(32).toString("base64url") : null,
      verifiedAt: new Date()
    }
  });
  return "created";
}

/**
 * Seeds every provider group for a single tenant. Exported separately from
 * `main()` so it is testable against a hand-rolled Prisma mock, with no live
 * database required.
 */
export async function seedTenantIntegrations(
  client: PrismaClient,
  tenant: SeedTenant,
  env: SeedEnv
): Promise<SeedResult[]> {
  const results: SeedResult[] = [];

  if (env.twilio) {
    const fromNumber = resolveWhatsappFromNumber(tenant, env.twilio.waFrom);
    if (fromNumber) {
      const twilioSecrets = { accountSid: env.twilio.accountSid, authToken: env.twilio.authToken };

      results.push({
        provider: "twilio_whatsapp",
        result: await insertIfMissing(client, tenant.id, "twilio_whatsapp", { fromNumber }, twilioSecrets)
      });

      // Vapi itself stays platform-owned (D-04) — no Vapi credential is ever
      // written to a tenant row, only the resolved phone number id.
      const voicePublicConfig: Record<string, string> = { outboundNumber: fromNumber.replace(/^whatsapp:/, "") };
      if (env.vapiPhoneNumberId) {
        voicePublicConfig["vapiPhoneNumberId"] = env.vapiPhoneNumberId;
      }
      results.push({
        provider: "twilio_voice",
        result: await insertIfMissing(client, tenant.id, "twilio_voice", voicePublicConfig, twilioSecrets)
      });
    }
  }

  if (env.sendgrid) {
    results.push({
      provider: "sendgrid",
      result: await insertIfMissing(
        client,
        tenant.id,
        "sendgrid",
        { fromEmail: env.sendgrid.fromEmail ?? "noreply@cobrai.dev", replyDomain: REPLY_DOMAIN },
        { apiKey: env.sendgrid.apiKey }
      )
    });
  }

  if (env.mercadopago) {
    const secrets: Record<string, string> = { accessToken: env.mercadopago.accessToken };
    if (env.mercadopago.webhookSecret) {
      secrets["webhookSecret"] = env.mercadopago.webhookSecret;
    }
    results.push({
      provider: "mercadopago",
      result: await insertIfMissing(client, tenant.id, "mercadopago", {}, secrets)
    });
  }

  return results;
}

/** Every existing, non-deleted tenant. New tenants created after the cutover are simply never in this list. */
export async function fetchActiveTenants(client: PrismaClient): Promise<SeedTenant[]> {
  return (await client.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true, settings: true }
  })) as SeedTenant[];
}

/**
 * Fails fast, before touching the database, when `ENCRYPTION_KEY_V1` is
 * missing or malformed. Seeding half the tenants and then failing on the
 * cipher mid-run is the worst outcome this script could produce.
 */
export function assertEncryptionKeyConfigured(): void {
  try {
    encryptSecretBundle({ probe: "x" });
  } catch {
    console.error(
      "ENCRYPTION_KEY_V1 no está configurada o no decodifica a 32 bytes. Abortando antes de escribir nada."
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  loadSeedEnv();
  assertEncryptionKeyConfigured();

  const env = loadProviderEnv();
  const tenants = await fetchActiveTenants(prisma);

  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const results = await seedTenantIntegrations(prisma, tenant, env);
    for (const result of results) {
      if (result.result === "created") created++;
      else skipped++;
    }
  }

  console.info(
    `Sembrado de integraciones: ${tenants.length} tenants procesados → ${created} filas creadas, ${skipped} omitidas.`
  );
}

// Guarded so importing this module (e.g. from the spec file, which needs the
// exported functions) never runs `main()` as a side effect of the import.
if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error("Error al sembrar integraciones de tenant:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
