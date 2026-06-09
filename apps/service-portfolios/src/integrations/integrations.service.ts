import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaService } from "../kafka/kafka.service";
import { DebtsService } from "../debts/debts.service";
import { DebtorsService } from "../debtors/debtors.service";
import { PortfoliosService } from "../portfolios/portfolios.service";
import type { CreateIntegrationDto, OutboundEvent } from "./dto/integration.dto";

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const SCRYPT_N = 16384;
const PREFIX_LEN = 12;
const KEY_VERSION = "v1";

function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const raw = randomBytes(KEY_LENGTH).toString("hex");
  const plaintext = `cobra_live_${raw}`;
  const prefix = plaintext.slice(0, PREFIX_LEN);

  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(plaintext, salt, 64, { N: SCRYPT_N });
  const hash = `${KEY_VERSION}:${salt.toString("hex")}:${derived.toString("hex")}`;

  return { plaintext, hash, prefix };
}

function verifyApiKey(plaintext: string, stored: string): boolean {
  try {
    const parts = stored.split(":");
    if (parts.length !== 3 || parts[0] !== KEY_VERSION) return false;
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const actual = scryptSync(plaintext, salt, 64, { N: SCRYPT_N });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function signOutboundPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService,
    private readonly debtsService: DebtsService,
    private readonly debtorsService: DebtorsService,
    private readonly portfoliosService: PortfoliosService,
    private readonly config: ConfigService
  ) {}

  async list(tenantId: string) {
    const rows = await this.prisma.integration.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" }
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      erp_type: r.erpType,
      api_key_prefix: r.apiKeyPrefix,
      outbound_url: r.outboundUrl ?? null,
      outbound_events: r.outboundEvents as OutboundEvent[],
      is_active: r.isActive,
      last_event_at: r.lastEventAt?.toISOString() ?? null,
      created_at: r.createdAt.toISOString()
    }));
  }

  async create(tenantId: string, dto: CreateIntegrationDto) {
    const { plaintext, hash, prefix } = generateApiKey();

    const outboundSecret = dto.outbound_url
      ? randomBytes(32).toString("hex")
      : undefined;

    const integration = await this.prisma.integration.create({
      data: {
        tenantId,
        name: dto.name,
        erpType: dto.erp_type,
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        outboundUrl: dto.outbound_url ?? null,
        outboundSecret: outboundSecret ?? null,
        outboundEvents: (dto.outbound_events ?? []) as string[]
      }
    });

    return {
      id: integration.id,
      name: integration.name,
      erp_type: integration.erpType,
      api_key_prefix: integration.apiKeyPrefix,
      api_key: plaintext,
      outbound_url: integration.outboundUrl ?? null,
      outbound_secret: outboundSecret ?? null,
      outbound_events: integration.outboundEvents as OutboundEvent[],
      is_active: integration.isActive,
      created_at: integration.createdAt.toISOString()
    };
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.integration.findFirst({
      where: { id, tenantId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Integración no encontrada");

    await this.prisma.integration.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });
  }

  async test(tenantId: string, id: string): Promise<{ success: boolean; status?: number; error?: string }> {
    const integration = await this.prisma.integration.findFirst({
      where: { id, tenantId, deletedAt: null }
    });
    if (!integration) throw new NotFoundException("Integración no encontrada");
    if (!integration.outboundUrl) {
      return { success: false, error: "Esta integración no tiene URL de webhook configurada" };
    }

    const payload = JSON.stringify({
      event: "test",
      timestamp: new Date().toISOString(),
      integration_id: id
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "CobraAI-Webhook/1.0"
    };

    if (integration.outboundSecret) {
      headers["X-CobraAI-Signature"] = `sha256=${signOutboundPayload(integration.outboundSecret, payload)}`;
    }

    try {
      const res = await fetch(integration.outboundUrl, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(10_000)
      });
      return { success: res.ok, status: res.status };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async ingest(
    apiKey: string,
    portfolioId: string,
    debts: unknown[]
  ): Promise<{ created: number; updated: number; errors: string[] }> {
    const integration = await this.resolveIntegrationByKey(apiKey);
    const { tenantId } = integration;

    await this.portfoliosService.findOne(tenantId, portfolioId);

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < debts.length; i++) {
      const raw = debts[i] as Record<string, unknown>;
      const externalRef = raw["external_ref"] ? String(raw["external_ref"]) : undefined;
      const debtorRaw = (raw["debtor"] as Record<string, unknown>) ?? {};

      const debtorInput = {
        name: String(debtorRaw["name"] ?? raw["debtor_name"] ?? "Sin nombre"),
        external_ref: String(debtorRaw["external_ref"] ?? raw["debtor_tax_id"] ?? ""),
        debtor_type: "company" as const,
        debtor_tax_id: String(debtorRaw["tax_id"] ?? raw["debtor_tax_id"] ?? ""),
        phones: (debtorRaw["phones"] as string[]) ?? [],
        debtor_email: String(debtorRaw["email"] ?? raw["debtor_email"] ?? ""),
        whatsapp_opt_in: false
      };

      try {
        const existing = externalRef
          ? await this.prisma.debt.findFirst({
              where: { tenantId, portfolioId, externalRef, deletedAt: null }
            })
          : null;

        if (existing) {
          // Upsert: actualizar campos financieros y deudor
          const amount = raw["amount"] !== undefined ? Number(raw["amount"]) : undefined;
          await this.debtsService.update(tenantId, existing.id, {
            amount_outstanding: amount !== undefined ? amount : undefined,
            metadata: (raw["metadata"] as Record<string, unknown>) ?? undefined
          });
          // Actualizar deudor con datos frescos del ERP
          await this.debtorsService.upsertForDebt(tenantId, debtorInput);
          updated++;
        } else {
          await this.debtsService.create(tenantId, {
            portfolio_id: portfolioId,
            external_ref: externalRef,
            amount: Number(raw["amount"] ?? 0),
            currency: String(raw["currency"] ?? "COP"),
            due_date: String(raw["due_date"] ?? new Date().toISOString()),
            scheduled_collection_date: raw["scheduled_collection_date"]
              ? String(raw["scheduled_collection_date"])
              : undefined,
            payment_terms_days: raw["payment_terms_days"]
              ? Number(raw["payment_terms_days"])
              : undefined,
            invoice_date: raw["invoice_date"] ? String(raw["invoice_date"]) : undefined,
            metadata: (raw["metadata"] as Record<string, unknown>) ?? {},
            debtor: debtorInput
          });
          created++;
        }
      } catch (err) {
        errors.push(`Deuda ${i + 1}: ${(err as Error).message}`);
      }
    }

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { lastEventAt: new Date() }
    });

    await this.kafka.publish("cobrai.erp.ingest", integration.tenantId, {
      integration_id: integration.id,
      portfolio_id: portfolioId,
      created,
      updated,
      errors: errors.length
    });

    return { created, updated, errors };
  }

  async dispatchOutbound(
    tenantId: string,
    event: OutboundEvent,
    payload: unknown
  ): Promise<void> {
    const integrations = await this.prisma.integration.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        outboundUrl: { not: null }
      }
    });

    for (const integration of integrations) {
      const events = integration.outboundEvents as OutboundEvent[];
      if (events.length > 0 && !events.includes(event)) continue;
      if (!integration.outboundUrl) continue;

      const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "CobraAI-Webhook/1.0"
      };

      if (integration.outboundSecret) {
        headers["X-CobraAI-Signature"] = `sha256=${signOutboundPayload(integration.outboundSecret, body)}`;
      }

      fetch(integration.outboundUrl, { method: "POST", headers, body }).catch((err) => {
        this.logger.warn(`Outbound webhook ${integration.id} failed: ${(err as Error).message}`);
      });
    }
  }

  private async resolveIntegrationByKey(apiKey: string) {
    if (!apiKey?.startsWith("cobra_live_")) {
      throw new UnauthorizedException("API key inválida");
    }
    const prefix = apiKey.slice(0, PREFIX_LEN);

    const candidates = await this.prisma.integration.findMany({
      where: { apiKeyPrefix: prefix, isActive: true, deletedAt: null }
    });

    for (const candidate of candidates) {
      if (verifyApiKey(apiKey, candidate.apiKeyHash)) {
        return candidate;
      }
    }

    throw new UnauthorizedException("API key no válida o inactiva");
  }
}
