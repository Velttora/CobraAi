import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import type { ContactChannel } from "@cobrai/db";
import { ComplianceService } from "@cobrai/compliance";
import { DebtorMemoryService } from "../memory/debtor-memory.service";
import { ContactsService, type ContactRequestPayload } from "../contacts/contacts.service";

export interface DebtorContactQueuePayload {
  debt_id: string;
  debtor_id: string;
  channel?: string;
  template_id?: string;
  template_hint?: string;
  rule_id?: string;
  priority_score?: number;
  attempt_number?: number;
  previous_channel?: string;
  escalation?: "switch_channel" | "same_channel";
}

@Injectable()
export class DebtorContactCoordinatorService {
  private readonly logger = new Logger(DebtorContactCoordinatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly debtorMemory: DebtorMemoryService,
    private readonly contacts: ContactsService
  ) {}

  /**
   * Punto de entrada para contactos originados por workflows.
   *
   * Lógica:
   * - Si el deudor ya tiene un contacto en curso (esperando respuesta o en cooldown de
   *   reintento) para OTRA deuda → registrar esta deuda como pendiente en el perfil del
   *   deudor para que el agente la mencione en la próxima interacción.
   * - Si el contacto en curso es exactamente esta deuda (reintento/re-disparo) → dejar
   *   pasar, es el flujo normal de reintento.
   * - Si no hay nada en curso → delegar a ContactsService para ejecutar el contacto.
   *
   * El estado "en curso" se resuelve con ComplianceService.getRetryState, la misma
   * fuente de verdad que usa el gate de envío — evita reimplementar el bloqueo semanal
   * dos veces con lógicas distintas.
   *
   * La serialización de mensajes del consumer de Kafka (eachMessage con await)
   * garantiza que dos deudas del mismo deudor no se procesen concurrentemente,
   * eliminando la necesidad de bloqueos adicionales.
   */
  async handleQueuedRequest(
    tenantId: string,
    payload: DebtorContactQueuePayload
  ): Promise<void> {
    if (!payload.debt_id || !payload.debtor_id) {
      this.logger.warn(`Coordinador: payload inválido — debt_id o debtor_id vacío`);
      return;
    }

    const retryState = await this.compliance.getRetryState(
      tenantId,
      payload.debtor_id,
      new Date()
    );

    if (!retryState.allowed) {
      const existingContact = await this.prisma.contact.findFirst({
        where: {
          tenantId,
          debtorId: payload.debtor_id,
          status: { in: ["scheduled", "in_progress", "completed", "failed"] }
        },
        orderBy: { createdAt: "desc" },
        select: { debtId: true }
      });

      if (existingContact?.debtId === payload.debt_id) {
        this.logger.log(
          `Coordinador: deuda ${payload.debt_id} ya tiene contacto en curso (${retryState.reason}) — ignorando redisparo`
        );
        return;
      }
      await this.deferDebt(tenantId, payload.debtor_id, payload.debt_id);
      return;
    }

    // Sin contacto en curso — este es el contacto primario del deudor.
    this.logger.log(
      `Coordinador: ejecutando contacto primario debt=${payload.debt_id} debtor=${payload.debtor_id}`
    );
    await this.contacts.handleContactRequested(tenantId, {
      debt_id: payload.debt_id,
      debtor_id: payload.debtor_id,
      channel: payload.channel as ContactChannel | undefined,
      template_id: payload.template_id,
      template_hint: payload.template_hint,
      rule_id: payload.rule_id,
      attempt_number: payload.attempt_number,
      previous_channel: payload.previous_channel as ContactChannel | undefined,
      escalation: payload.escalation
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
