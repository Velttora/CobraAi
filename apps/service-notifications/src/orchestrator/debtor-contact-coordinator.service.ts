import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import type { ContactChannel } from "@cobrai/db";
import { DebtorMemoryService } from "../memory/debtor-memory.service";
import type { ContactsService, ContactRequestPayload } from "../contacts/contacts.service";

export interface DebtorContactQueuePayload {
  debt_id: string;
  debtor_id: string;
  channel?: string;
  template_id?: string;
  template_hint?: string;
  rule_id?: string;
  priority_score?: number;
}

@Injectable()
export class DebtorContactCoordinatorService {
  private readonly logger = new Logger(DebtorContactCoordinatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly debtorMemory: DebtorMemoryService,
    private readonly contacts: ContactsService
  ) {}

  /**
   * Punto de entrada para contactos originados por workflows.
   *
   * Lógica:
   * - Si el deudor ya tiene un contacto activo esta semana → registrar la deuda
   *   como pendiente en el perfil del deudor para que el agente la mencione en
   *   la próxima interacción.
   * - Si no → delegar a ContactsService para ejecutar el contacto normalmente.
   *   El agente tendrá en contexto cualquier pendingDebt registrado previamente.
   *
   * La serialización de mensajes del consumer de Kafka (eachMessage con await)
   * garantiza que dos deudas del mismo deudor no se procesen concurrentemente,
   * eliminando la necesidad de bloqueos adicionales.
   */
  async handleQueuedRequest(
    tenantId: string,
    payload: DebtorContactQueuePayload
  ): Promise<void> {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const existingContact = await this.prisma.contact.findFirst({
      where: {
        tenantId,
        debtorId: payload.debtor_id,
        status: { in: ["scheduled", "in_progress", "completed"] },
        createdAt: { gte: weekStart }
      },
      select: { id: true }
    });

    if (existingContact) {
      await this.deferDebt(tenantId, payload.debtor_id, payload.debt_id);
      return;
    }

    // Sin contacto previo esta semana — este es el contacto primario del deudor.
    this.logger.log(
      `Coordinador: ejecutando contacto primario debt=${payload.debt_id} debtor=${payload.debtor_id}`
    );
    await this.contacts.handleContactRequested(tenantId, {
      debt_id: payload.debt_id,
      debtor_id: payload.debtor_id,
      channel: payload.channel as ContactChannel | undefined,
      template_id: payload.template_id,
      template_hint: payload.template_hint,
      rule_id: payload.rule_id
    } as ContactRequestPayload);
  }

  private async deferDebt(
    tenantId: string,
    debtorId: string,
    debtId: string
  ): Promise<void> {
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, tenantId, deletedAt: null },
      select: {
        id: true,
        externalRef: true,
        amountOutstanding: true,
        currency: true,
        dueDate: true
      }
    });
    if (!debt) return;

    await this.debtorMemory.registerPendingDebt(tenantId, debtorId, {
      debtId: debt.id,
      externalRef: debt.externalRef ?? null,
      amountOutstanding: Number(debt.amountOutstanding),
      currency: debt.currency,
      dueDate: new Date(debt.dueDate).toISOString().split("T")[0] as string
    });

    this.logger.log(
      `Coordinador: deuda ${debt.externalRef ?? debtId} diferida — deudor ${debtorId} ya contactado esta semana`
    );
  }
}
