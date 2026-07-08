import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "@cobrai/db";
import { resolveRetryPolicy } from "@cobrai/compliance";
import { ContactsService } from "../contacts/contacts.service";

/**
 * Vence los intentos de contacto que llevan más de `windowHours` (política por tenant,
 * default 24h) sin respuesta y los marca "sin contacto" — reemplaza el bloqueo semanal
 * fijo por un ciclo de espera-por-respuesta real. La decisión de reintentar (siguiente
 * canal) o escalar (agotó intentos) la toma WorkflowsService al consumir el evento
 * `cobrai.contact.no_response` que ContactsService.markContactExpired publica.
 */
@Injectable()
export class ContactRetrySweepService {
  private readonly logger = new Logger(ContactRetrySweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService
  ) {}

  @Cron("0 * * * *")
  async sweepExpiredContacts(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true, settings: true }
    });

    let expired = 0;
    for (const tenant of tenants) {
      const policy = resolveRetryPolicy(tenant.settings);
      const cutoff = new Date(Date.now() - policy.windowHours * 60 * 60 * 1000);

      const pending = await this.prisma.contact.findMany({
        where: {
          tenantId: tenant.id,
          deletedAt: null,
          responseStatus: "pending",
          status: "completed",
          startedAt: { lte: cutoff }
        },
        select: { id: true }
      });

      for (const contact of pending) {
        await this.contacts.markContactExpired(tenant.id, contact.id);
        expired += 1;
      }
    }

    if (expired > 0) {
      this.logger.log(`Sweep de reintentos: ${expired} contacto(s) vencidos sin respuesta`);
    }
  }
}
