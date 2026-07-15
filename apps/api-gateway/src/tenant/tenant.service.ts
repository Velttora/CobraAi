import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ensureTenantRecord, PrismaService, type Prisma, type Tenant } from "@cobrai/db";
import { normalizeClerkRole } from "../common/types/clerk-request";
import {
  normalizeWhatsappFromNumber,
  sanitizeContactRetryPolicy,
  toTenantProfile,
  type TenantProfile,
  type UpdateContactRetryPolicyDto,
  type UpdateWhatsappSenderDto
} from "./dto/tenant-profile.dto";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

type ClerkOrganization = {
  name?: string;
  slug?: string | null;
};

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  assertAdmin(role?: string): void {
    if (normalizeClerkRole(role) !== "admin") {
      throw new ForbiddenException(
        "Solo administradores pueden editar la organización"
      );
    }
  }

  async getCurrent(tenantId: string): Promise<TenantProfile> {
    await ensureTenantRecord(this.prisma, tenantId);

    let tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null }
    });

    if (!tenant) {
      throw new NotFoundException("Organización no encontrada");
    }

    tenant = await this.syncNameFromClerk(tenantId, tenant);

    return toTenantProfile(tenant);
  }

  async updateName(
    tenantId: string,
    name: string | undefined,
    role?: string
  ): Promise<TenantProfile> {
    this.assertAdmin(role);

    const trimmed = name?.trim() ?? "";
    if (!trimmed) {
      throw new ForbiddenException("El nombre no puede estar vacío");
    }
    if (trimmed.length > 120) {
      throw new ForbiddenException("El nombre no puede superar 120 caracteres");
    }

    await ensureTenantRecord(this.prisma, tenantId, trimmed);

    const slug = slugify(trimmed);
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { name: trimmed, slug }
    });

    await this.syncClerkOrganizationName(tenantId, trimmed);

    return toTenantProfile(tenant);
  }

  /** Actualiza (merge parcial) la política de reintento de contacto del tenant. */
  async updateContactRetryPolicy(
    tenantId: string,
    patch: UpdateContactRetryPolicyDto,
    role?: string
  ): Promise<TenantProfile> {
    this.assertAdmin(role);

    const current = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null }
    });
    if (!current) {
      throw new NotFoundException("Organización no encontrada");
    }

    const currentSettings = (current.settings ?? {}) as Record<string, unknown>;
    const currentPolicy = sanitizeContactRetryPolicy(currentSettings.contactRetryPolicy);
    const nextPolicy = sanitizeContactRetryPolicy(patch, currentPolicy);

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...currentSettings,
          contactRetryPolicy: nextPolicy
        } as Prisma.InputJsonValue
      }
    });

    return toTenantProfile(tenant);
  }

  /**
   * Asigna (o limpia) el número de WhatsApp Business propio del tenant. Necesario
   * cuando el mismo deudor le debe a varios tenants: cada uno debe tener su propio
   * número para que WhatsApp separe los hilos y el webhook de entrada pueda
   * resolver el tenant por el número al que le escribieron, sin ambigüedad.
   */
  async updateWhatsappSender(
    tenantId: string,
    patch: UpdateWhatsappSenderDto,
    role?: string
  ): Promise<TenantProfile> {
    this.assertAdmin(role);

    const normalized = normalizeWhatsappFromNumber(patch.whatsappFromNumber);

    if (normalized) {
      const conflict = await this.prisma.$queryRaw<
        Array<{ id: string; name: string }>
      >`
        SELECT id, name FROM tenants
        WHERE deleted_at IS NULL AND id != ${tenantId}
        AND settings->>'whatsappFromNumber' = ${normalized}
        LIMIT 1
      `;
      if (conflict[0]) {
        throw new ForbiddenException(
          `Ese número ya está asignado a otra organización (${conflict[0].name})`
        );
      }
    }

    const current = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null }
    });
    if (!current) {
      throw new NotFoundException("Organización no encontrada");
    }

    const currentSettings = (current.settings ?? {}) as Record<string, unknown>;

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...currentSettings,
          whatsappFromNumber: normalized
        } as Prisma.InputJsonValue
      }
    });

    return toTenantProfile(tenant);
  }

  private async syncNameFromClerk(
    tenantId: string,
    tenant: Tenant
  ): Promise<Tenant> {
    const clerkOrg = await this.fetchClerkOrganization(tenantId);
    if (!clerkOrg?.name?.trim()) {
      return tenant;
    }

    const clerkName = clerkOrg.name.trim();
    const clerkSlug = clerkOrg.slug?.trim() || slugify(clerkName);

    if (tenant.name === clerkName && tenant.slug === clerkSlug) {
      return tenant;
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: clerkName,
        slug: clerkSlug
      }
    });
  }

  private async fetchClerkOrganization(
    tenantId: string
  ): Promise<ClerkOrganization | null> {
    const secret = this.config.get<string>("CLERK_SECRET_KEY")?.trim();
    if (!secret) {
      return null;
    }

    try {
      const response = await fetch(
        `https://api.clerk.com/v1/organizations/${tenantId}`,
        {
          headers: { Authorization: `Bearer ${secret}` }
        }
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as ClerkOrganization;
    } catch {
      return null;
    }
  }

  private async syncClerkOrganizationName(
    tenantId: string,
    name: string
  ): Promise<void> {
    const secret = this.config.get<string>("CLERK_SECRET_KEY")?.trim();
    if (!secret) {
      return;
    }

    try {
      const response = await fetch(
        `https://api.clerk.com/v1/organizations/${tenantId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name })
        }
      );

      if (!response.ok) {
        const detail = await response.text();
        console.warn(
          `No se pudo sincronizar nombre en Clerk (${response.status}): ${detail}`
        );
      }
    } catch (error) {
      console.warn("Error al sincronizar nombre en Clerk:", error);
    }
  }
}
