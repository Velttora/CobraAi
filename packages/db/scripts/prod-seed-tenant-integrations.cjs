/**
 * Siembra TenantIntegration desde las credenciales globales actuales (D-18) en Fly.
 * Uso: ver infra/fly/run-prod-seed-tenant-integrations.sh
 *
 * Reimplementación en JS plano de packages/db/src/seed-tenant-integrations.ts,
 * siguiendo el patrón de prod-fix-escalations.cjs (el contenedor desplegado no
 * tiene el CLI de tsx). El cifrado se importa de @cobrai/utils — nunca se
 * reimplementa AES-256-GCM aquí.
 */
const { PrismaClient } = require("@prisma/client");
const { encryptSecretBundle, lastFour } = require("@cobrai/utils");

const prisma = new PrismaClient();

const SEED_WEBHOOK_CAPABLE_PROVIDERS = ["twilio_whatsapp", "sendgrid", "mercadopago"];
const REPLY_DOMAIN = "reply.fogging.org";

function loadProviderEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilio =
    accountSid && authToken
      ? { accountSid, authToken, waFrom: process.env.TWILIO_WA_FROM || process.env.TWILIO_FROM_NUMBER || null }
      : null;
  if (!twilio) {
    console.log(
      "Twilio no configurado (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN ausentes): se omiten twilio_whatsapp y twilio_voice."
    );
  }

  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const sendgrid = sendgridApiKey
    ? { apiKey: sendgridApiKey, fromEmail: process.env.SENDGRID_FROM_EMAIL || null }
    : null;
  if (!sendgrid) {
    console.log("SendGrid no configurado (SENDGRID_API_KEY ausente): se omite sendgrid.");
  }

  const mpAccessToken = process.env.MP_ACCESS_TOKEN;
  const mercadopago = mpAccessToken
    ? { accessToken: mpAccessToken, webhookSecret: process.env.MP_WEBHOOK_SECRET || null }
    : null;
  if (!mercadopago) {
    console.log("Mercado Pago no configurado (MP_ACCESS_TOKEN ausente): se omite mercadopago.");
  }

  return { twilio, sendgrid, mercadopago, vapiPhoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || null };
}

function resolveWhatsappFromNumber(tenant, envFrom) {
  const settings = tenant.settings || {};
  if (typeof settings.whatsappFromNumber === "string" && settings.whatsappFromNumber) {
    return settings.whatsappFromNumber;
  }
  if (!envFrom) return null;
  return envFrom.startsWith("whatsapp:") ? envFrom : `whatsapp:${envFrom}`;
}

function buildSecretsMeta(secrets) {
  const savedAt = new Date().toISOString();
  const meta = {};
  for (const [field, value] of Object.entries(secrets)) {
    meta[field] = { lastFour: lastFour(value), savedAt };
  }
  return meta;
}

/** Skip-if-exists: findUnique + create, never a single combined write — never overwrites a tenant's own config. */
async function insertIfMissing(tenantId, provider, publicConfig, secrets) {
  const existing = await prisma.tenantIntegration.findUnique({
    where: { tenantId_provider: { tenantId, provider } }
  });
  if (existing) return "skipped";

  const { ciphertext, keyVersion } = encryptSecretBundle(secrets);

  await prisma.tenantIntegration.create({
    data: {
      tenantId,
      provider,
      mode: "managed",
      status: "verified",
      publicConfig,
      secretsCipher: ciphertext,
      secretsMeta: buildSecretsMeta(secrets),
      keyVersion,
      webhookToken: SEED_WEBHOOK_CAPABLE_PROVIDERS.includes(provider) ? require("node:crypto").randomBytes(32).toString("base64url") : null,
      verifiedAt: new Date()
    }
  });
  return "created";
}

async function seedTenantIntegrations(tenant, env) {
  const results = [];

  if (env.twilio) {
    const fromNumber = resolveWhatsappFromNumber(tenant, env.twilio.waFrom);
    if (fromNumber) {
      const twilioSecrets = { accountSid: env.twilio.accountSid, authToken: env.twilio.authToken };

      results.push({
        provider: "twilio_whatsapp",
        result: await insertIfMissing(tenant.id, "twilio_whatsapp", { fromNumber }, twilioSecrets)
      });

      const voicePublicConfig = { outboundNumber: fromNumber.replace(/^whatsapp:/, "") };
      if (env.vapiPhoneNumberId) voicePublicConfig.vapiPhoneNumberId = env.vapiPhoneNumberId;
      results.push({
        provider: "twilio_voice",
        result: await insertIfMissing(tenant.id, "twilio_voice", voicePublicConfig, twilioSecrets)
      });
    }
  }

  if (env.sendgrid) {
    results.push({
      provider: "sendgrid",
      result: await insertIfMissing(
        tenant.id,
        "sendgrid",
        { fromEmail: env.sendgrid.fromEmail || "noreply@cobrai.dev", replyDomain: REPLY_DOMAIN },
        { apiKey: env.sendgrid.apiKey }
      )
    });
  }

  if (env.mercadopago) {
    const secrets = { accessToken: env.mercadopago.accessToken };
    if (env.mercadopago.webhookSecret) secrets.webhookSecret = env.mercadopago.webhookSecret;
    results.push({
      provider: "mercadopago",
      result: await insertIfMissing(tenant.id, "mercadopago", {}, secrets)
    });
  }

  return results;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está configurada en el runtime.");
  }

  try {
    encryptSecretBundle({ probe: "x" });
  } catch {
    console.error("ENCRYPTION_KEY_V1 no está configurada o no decodifica a 32 bytes. Abortando antes de escribir nada.");
    process.exit(1);
  }

  const env = loadProviderEnv();
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true, settings: true }
  });

  let created = 0;
  let skipped = 0;
  for (const tenant of tenants) {
    const results = await seedTenantIntegrations(tenant, env);
    for (const result of results) {
      if (result.result === "created") created++;
      else skipped++;
    }
  }

  console.log(
    `Sembrado de integraciones: ${tenants.length} tenants procesados → ${created} filas creadas, ${skipped} omitidas.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
