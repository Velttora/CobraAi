import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import type { ContactChannel, Debtor } from "@cobrai/db";
import { Prisma } from "@prisma/client";
import { normalizePhoneE164 } from "@cobrai/utils";
import type { UpdateDebtorDto } from "../debts/dto/debt.dto";
import { ScoringService } from "../ai-scoring/scoring.service";

/** Canales con consentimiento implícito al importar/crear deudor en cartera. */
const DEFAULT_CONSENT_CHANNELS: ContactChannel[] = [
  "email",
  "whatsapp",
  "sms",
  "voice"
];

type UpsertDebtorInput = {
  name: string;
  external_ref?: string;
  debtor_type?: "person" | "company";
  debtor_tax_id?: string;
  phones?: string[];
  debtor_email?: string;
  whatsapp_opt_in?: boolean;
};

@Injectable()
export class DebtorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService
  ) {}

  async findOne(tenantId: string, id: string) {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        debts: { where: { deletedAt: null }, orderBy: { dueDate: "desc" }, include: { portfolio: { select: { id: true, name: true } } } },
        consents: true
      }
    });
    if (!debtor) {
      throw new NotFoundException("Deudor no encontrado");
    }
    return debtor;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateDebtorDto
  ): Promise<Debtor> {
    await this.findOne(tenantId, id);
    const addressUpdate =
      dto.address_city || dto.address_country
        ? {
            address: {
              ...(dto.address_city ? { city: dto.address_city } : {}),
              ...(dto.address_country ? { country: dto.address_country } : {})
            }
          }
        : {};

    const email =
      dto.email === undefined
        ? undefined
        : dto.email.trim() === ""
          ? null
          : dto.email.trim();

    const updated = await this.prisma.debtor.update({
      where: { id },
      data: {
        name: dto.name,
        email,
        whatsappOptIn: dto.whatsapp_opt_in,
        phones: dto.phones
          ? dto.phones
              .map((p) => normalizePhoneE164(p))
              .filter((p): p is string => Boolean(p))
          : undefined,
        ...addressUpdate
      }
    });

    await this.scoringService.refreshScoresForDebtor(tenantId, id);
    return updated;
  }

  async upsertForDebt(
    tenantId: string,
    input: UpsertDebtorInput
  ): Promise<Debtor> {
    const externalRef = input.external_ref?.trim() || undefined;
    const taxId = input.debtor_tax_id?.trim() || undefined;
    const name = input.name?.trim();

    if (taxId) {
      const byTax = await this.findActiveDebtor(tenantId, { taxId });
      if (byTax) return this.finalizeUpsert(tenantId, byTax);

      const archived = await this.findArchivedDebtor(tenantId, { taxId });
      if (archived) {
        return this.finalizeUpsert(
          tenantId,
          await this.reactivateDebtor(archived, input, { taxId, externalRef })
        );
      }
    }

    if (externalRef) {
      const byRef = await this.findActiveDebtor(tenantId, { externalRef });
      if (byRef) return this.finalizeUpsert(tenantId, byRef);

      const archived = await this.findArchivedDebtor(tenantId, { externalRef });
      if (archived) {
        return this.finalizeUpsert(
          tenantId,
          await this.reactivateDebtor(archived, input, { taxId, externalRef })
        );
      }
    }

    if (name) {
      const byName = await this.findActiveDebtor(tenantId, { name });
      if (byName) return this.finalizeUpsert(tenantId, byName);
    }

    const phones = this.normalizePhones(input.phones);

    try {
      return this.finalizeUpsert(
        tenantId,
        await this.prisma.debtor.create({
          data: {
            tenantId,
            name: name ?? input.name,
            externalRef,
            type: input.debtor_type ?? "person",
            taxId,
            phones,
            email: input.debtor_email,
            whatsappOptIn: input.whatsapp_opt_in ?? phones.length > 0
          }
        })
      );
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.findAnyDebtor(tenantId, {
        externalRef,
        taxId
      });
      if (!existing) {
        throw error;
      }

      if (existing.deletedAt) {
        return this.finalizeUpsert(
          tenantId,
          await this.reactivateDebtor(existing, input, { taxId, externalRef })
        );
      }
      return this.finalizeUpsert(tenantId, existing);
    }
  }

  /** Registra consentimiento en todos los canales si falta (p. ej. deudores importados). */
  private async ensureDefaultConsents(
    tenantId: string,
    debtorId: string
  ): Promise<void> {
    for (const channel of DEFAULT_CONSENT_CHANNELS) {
      const existing = await this.prisma.contactConsent.findFirst({
        where: {
          tenantId,
          debtorId,
          channel,
          revokedAt: null,
          deletedAt: null
        }
      });
      if (existing) continue;

      await this.prisma.contactConsent.create({
        data: {
          tenantId,
          debtorId,
          channel,
          source: "import",
          consentedAt: new Date()
        }
      });
    }
  }

  private async finalizeUpsert(
    tenantId: string,
    debtor: Debtor
  ): Promise<Debtor> {
    await this.ensureDefaultConsents(tenantId, debtor.id);

    const phones = (debtor.phones as string[] | null) ?? [];
    if (!debtor.whatsappOptIn && (phones.length > 0 || debtor.email)) {
      return this.prisma.debtor.update({
        where: { id: debtor.id },
        data: { whatsappOptIn: true }
      });
    }

    return debtor;
  }

  private normalizePhones(phones: string[] | undefined): string[] {
    return (phones ?? [])
      .map((p) => normalizePhoneE164(p))
      .filter((p): p is string => Boolean(p));
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private findActiveDebtor(
    tenantId: string,
    where: { taxId?: string; externalRef?: string; name?: string }
  ) {
    return this.prisma.debtor.findFirst({
      where: { tenantId, deletedAt: null, ...where }
    });
  }

  private findArchivedDebtor(
    tenantId: string,
    where: { taxId?: string; externalRef?: string }
  ) {
    return this.prisma.debtor.findFirst({
      where: { tenantId, deletedAt: { not: null }, ...where }
    });
  }

  private findAnyDebtor(
    tenantId: string,
    input: { taxId?: string; externalRef?: string }
  ) {
    const or: Prisma.DebtorWhereInput[] = [];
    if (input.taxId) or.push({ taxId: input.taxId });
    if (input.externalRef) or.push({ externalRef: input.externalRef });
    if (or.length === 0) return Promise.resolve(null);

    return this.prisma.debtor.findFirst({
      where: { tenantId, OR: or }
    });
  }

  private async reactivateDebtor(
    debtor: Debtor,
    input: UpsertDebtorInput,
    ids: { taxId?: string; externalRef?: string }
  ): Promise<Debtor> {
    const phones = this.normalizePhones(input.phones);
    return this.prisma.debtor.update({
      where: { id: debtor.id },
      data: {
        deletedAt: null,
        name: input.name?.trim() || debtor.name,
        externalRef: ids.externalRef ?? debtor.externalRef,
        taxId: ids.taxId ?? debtor.taxId,
        type: input.debtor_type ?? debtor.type,
        phones: phones.length > 0 ? phones : undefined,
        email: input.debtor_email ?? debtor.email,
        whatsappOptIn: input.whatsapp_opt_in ?? debtor.whatsappOptIn
      }
    });
  }
}
