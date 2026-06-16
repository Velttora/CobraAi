import { ForbiddenException, Injectable } from "@nestjs/common";
import { ensureTenantRecord, PrismaService } from "@cobrai/db";
import {
  DEFAULT_EMAIL_LAYOUT,
  normalizeLayoutConfig,
  type EmailLayoutConfig
} from "@cobrai/utils";
import { normalizeClerkRole } from "../common/types/clerk-request";
import {
  sanitizeLayoutConfig,
  type EmailLayoutResponse
} from "./dto/email-layout.dto";

/** Devuelve la config normalizada, o el layout por defecto si está vacía. */
function configOrDefault(value: unknown): EmailLayoutConfig {
  const cfg = normalizeLayoutConfig(value as Partial<EmailLayoutConfig>);
  return cfg.blocks.length > 0 ? cfg : DEFAULT_EMAIL_LAYOUT;
}

@Injectable()
export class EmailLayoutService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(role?: string): void {
    if (normalizeClerkRole(role) !== "admin") {
      throw new ForbiddenException(
        "Solo administradores pueden editar la plantilla de correo"
      );
    }
  }

  async get(tenantId: string): Promise<EmailLayoutResponse> {
    await ensureTenantRecord(this.prisma, tenantId);
    const row = await this.prisma.emailLayout.findUnique({ where: { tenantId } });

    return {
      draft: configOrDefault(row?.draft),
      published: row?.published
        ? normalizeLayoutConfig(row.published as Partial<EmailLayoutConfig>)
        : null,
      published_at: row?.publishedAt ? row.publishedAt.toISOString() : null,
      has_published: Boolean(row?.published)
    };
  }

  async saveDraft(
    tenantId: string,
    role: string | undefined,
    input: unknown,
    userId?: string
  ): Promise<EmailLayoutResponse> {
    this.assertAdmin(role);
    await ensureTenantRecord(this.prisma, tenantId);

    const draft = sanitizeLayoutConfig(input);
    await this.prisma.emailLayout.upsert({
      where: { tenantId },
      create: { tenantId, draft: draft as never, updatedById: userId ?? null },
      update: { draft: draft as never, updatedById: userId ?? null }
    });

    return this.get(tenantId);
  }

  async publish(
    tenantId: string,
    role: string | undefined,
    userId?: string
  ): Promise<EmailLayoutResponse> {
    this.assertAdmin(role);
    await ensureTenantRecord(this.prisma, tenantId);

    const row = await this.prisma.emailLayout.findUnique({ where: { tenantId } });
    // Publica el borrador actual; si aún no hay borrador, publica el default.
    const snapshot = configOrDefault(row?.draft);
    const now = new Date();

    await this.prisma.emailLayout.upsert({
      where: { tenantId },
      create: {
        tenantId,
        draft: snapshot as never,
        published: snapshot as never,
        publishedAt: now,
        updatedById: userId ?? null
      },
      update: {
        published: snapshot as never,
        publishedAt: now,
        updatedById: userId ?? null
      }
    });

    return this.get(tenantId);
  }
}
