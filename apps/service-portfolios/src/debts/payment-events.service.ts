import { Injectable, Logger } from "@nestjs/common";
import { PrismaService, type DebtStatus } from "@cobrai/db";
import {
  applyPaymentToPromise,
  resolveDebtStatusAfterPayment
} from "@cobrai/utils";
import { decimalToNumber } from "../common/utils/api.utils";
import { KafkaService } from "../kafka/kafka.service";

/**
 * Aplica un pago confirmado sobre la deuda: saldo, promesas, planes y estado.
 *
 * Este servicio es el ÚNICO dueño del estado de la deuda ante un pago. Antes lo
 * calculaban en paralelo portfolios y workflows sobre el mismo evento, y el
 * resultado dependía de cuál consumidor ganara la carrera: si workflows llegaba
 * primero veía el plan `active` y escribía `plan`; si llegaba después lo veía
 * `completed` y escribía `paid_partial`. Aquí el cálculo ocurre una sola vez,
 * con el saldo y las promesas ya resueltos, y se comunica con
 * `cobrai.payment.applied`.
 */
@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger(PaymentEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService
  ) {}

  async handlePaymentConfirmed(
    tenantId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const debtId = String(payload.debt_id ?? "");
    if (!debtId) return;

    const amount = Number(payload.amount ?? 0);
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, tenantId, deletedAt: null }
    });
    if (!debt) {
      this.logger.warn(`Deuda ${debtId} no encontrada para pago confirmado`);
      return;
    }

    const outstandingBefore = decimalToNumber(debt.amountOutstanding);
    const outstandingAfter =
      payload.amount_outstanding !== undefined
        ? Number(payload.amount_outstanding)
        : Math.max(0, outstandingBefore - amount);

    const paidFull = outstandingAfter <= 0;

    const completedPlanIds = await this.resolvePendingPromises(
      tenantId,
      debt.id,
      amount,
      paidFull
    );

    const outcome = await this.resolveOutcome({
      tenantId,
      debtId: debt.id,
      currentStatus: debt.status,
      outstandingAfter,
      completedPlanIds
    });

    // Una sola escritura: saldo y estado salen del mismo cálculo, así que no
    // existe un instante en que la deuda tenga uno nuevo y el otro viejo.
    await this.prisma.debt.update({
      where: { id: debt.id },
      data: {
        amountOutstanding: outcome.amountOutstanding,
        status: outcome.status
      }
    });

    if (outcome.pendingSettlementAmount > 0) {
      await this.recordPendingSettlement(tenantId, debt.id, outcome);
    }

    if (outcome.status !== debt.status) {
      await this.kafka.publish("cobrai.debt.status_changed", tenantId, {
        debt_id: debt.id,
        from: debt.status,
        to: outcome.status,
        reason: "payment_confirmed"
      });
    }

    // Contrato con service-workflows: las reglas de `payment_confirmed` se
    // evalúan sobre este evento y no sobre `cobrai.payment.confirmed`, para que
    // lean la deuda ya actualizada. Evaluarlas antes hacía que una condición
    // sobre el estado o el saldo diera resultados distintos según el orden de
    // llegada de los consumidores.
    await this.kafka.publish("cobrai.payment.applied", tenantId, {
      debt_id: debt.id,
      amount,
      amount_outstanding: outcome.amountOutstanding,
      status: outcome.status,
      paid_full: outcome.amountOutstanding <= 0,
      plan_completed: completedPlanIds.length > 0
    });

    this.logger.log(
      `Deuda ${debtId} actualizada: outstanding=${outcome.amountOutstanding} ` +
        `status=${outcome.status}` +
        (outcome.pendingSettlementAmount > 0
          ? ` (acuerdo cumplido, ${outcome.pendingSettlementAmount} pendientes de decisión)`
          : "")
    );
  }

  /**
   * Estado y saldo con que queda la deuda tras aplicar el pago.
   *
   * Ninguna rama toca el saldo: condonar es una decisión humana. Cuando un plan
   * se termina de pagar y queda remanente, la deuda NO se cierra sola — el
   * remanente sobrevive intacto y el acuerdo queda esperando aprobación.
   *
   * Lo que sí se evita es el otro extremo: mandarla a `paid_partial`, que la
   * retiraba de toda gestión con saldo vivo y sin que nadie lo decidiera. Se
   * queda en `plan`, que está fuera del barrido de mora, hasta que un humano
   * resuelva.
   */
  private async resolveOutcome(input: {
    tenantId: string;
    debtId: string;
    currentStatus: string;
    outstandingAfter: number;
    completedPlanIds: string[];
  }): Promise<{
    status: DebtStatus;
    amountOutstanding: number;
    /** Remanente de un acuerdo cumplido, a la espera de decisión humana. */
    pendingSettlementAmount: number;
    completedPlanId: string | null;
  }> {
    if (input.completedPlanIds.length > 0 && input.outstandingAfter > 0) {
      return {
        // El deudor cumplió lo pactado y todavía figura un remanente: eso es
        // exactamente lo que un humano tiene que resolver (condonar o cobrar).
        // Hasta entonces la deuda ni se cierra ni se persigue.
        status: "plan",
        amountOutstanding: input.outstandingAfter,
        pendingSettlementAmount: input.outstandingAfter,
        completedPlanId: input.completedPlanIds[0] ?? null
      };
    }

    const hasActivePaymentPlan = Boolean(
      await this.prisma.paymentPlan.findFirst({
        where: {
          tenantId: input.tenantId,
          debtId: input.debtId,
          status: "active",
          deletedAt: null
        },
        select: { id: true }
      })
    );

    // `partial` cuenta como compromiso vivo: el deudor abonó menos de lo
    // prometido, no dejó de deber. Contar solo `pending` mandaba la deuda a
    // `paid_partial` y con eso fuera de toda gestión.
    const pendingStandalone = await this.prisma.promiseToPay.count({
      where: {
        tenantId: input.tenantId,
        debtId: input.debtId,
        status: { in: ["pending", "partial"] },
        planId: null,
        deletedAt: null
      }
    });

    return {
      status: resolveDebtStatusAfterPayment({
        currentStatus: input.currentStatus,
        amountOutstanding: input.outstandingAfter,
        hasActivePaymentPlan,
        hasPendingStandalonePromise: pendingStandalone > 0
      }),
      amountOutstanding: input.outstandingAfter,
      pendingSettlementAmount: 0,
      completedPlanId: input.completedPlanIds[0] ?? null
    };
  }

  /**
   * Un acuerdo se cumplió y quedó saldo. No mueve plata: lo pone en la cola de
   * aprobación para que una persona decida si se condona o se vuelve a cobrar.
   *
   * La fila se escribe directo porque `negotiations` es una tabla compartida y
   * quien aprueba vive en service-notifications. El shape es el mismo que usa
   * `NegotiationService.requestApproval` — si cambia allá, cambia acá.
   */
  private async recordPendingSettlement(
    tenantId: string,
    debtId: string,
    outcome: { pendingSettlementAmount: number; completedPlanId: string | null }
  ): Promise<void> {
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, tenantId, deletedAt: null },
      select: { debtorId: true, amountOutstanding: true }
    });

    const alreadyQueued = await this.prisma.negotiation.findFirst({
      where: { tenantId, debtId, status: "escalated", deletedAt: null },
      select: { id: true }
    });

    if (debt && !alreadyQueued) {
      await this.prisma.negotiation.create({
        data: {
          tenantId,
          debtId,
          debtorId: debt.debtorId,
          status: "escalated",
          round: 0,
          originalAmount: debt.amountOutstanding,
          offerSettlementAmount: outcome.pendingSettlementAmount,
          offerInstallments: 1,
          planId: outcome.completedPlanId,
          history: [
            {
              at: new Date().toISOString(),
              decision: "approval_requested",
              kind: "settlement_remainder",
              installments: [],
              notes: null,
              reasons: ["requiere_aprobacion_humana", "plan_cumplido_con_saldo"]
            }
          ]
        }
      });
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: "debt.settlement_pending_review",
        resourceType: "debt",
        resourceId: debtId,
        changes: {
          remaining_amount: outcome.pendingSettlementAmount,
          plan_id: outcome.completedPlanId,
          reason: "payment_plan_completed"
        }
      }
    });
  }

  /**
   * Cierra las promesas pendientes de la deuda cuando entra un pago, para que el
   * job de promesas vencidas no las marque como rotas habiéndose pagado.
   *
   * - Pago total: todas las promesas abiertas quedan "kept".
   * - Pago parcial: se cierra la promesa abierta más próxima a vencer (la que
   *   el pago busca cumplir); las demás (p.ej. cuotas futuras) siguen abiertas.
   *
   * Devuelve los planes que quedaron completos con este pago.
   */
  private async resolvePendingPromises(
    tenantId: string,
    debtId: string,
    amountPaid: number,
    paidFull: boolean
  ): Promise<string[]> {
    // Incluye `partial`: una promesa que quedó a medias con un abono anterior
    // sigue abierta, y un pago posterior tiene que poder cumplirla.
    const open = await this.prisma.promiseToPay.findMany({
      where: {
        tenantId,
        debtId,
        status: { in: ["pending", "partial"] },
        deletedAt: null
      },
      orderBy: { promisedDate: "asc" }
    });
    if (open.length === 0) return [];

    const targets = paidFull ? open : open.slice(0, 1);
    for (const promise of targets) {
      const { status: newStatus, amountPaid: accumulated } =
        applyPaymentToPromise({
          promiseAmount: decimalToNumber(promise.amount),
          alreadyPaid: decimalToNumber(promise.amountPaid),
          amountPaid,
          debtPaidFull: paidFull
        });
      await this.prisma.promiseToPay.update({
        where: { id: promise.id },
        data: { status: newStatus, amountPaid: accumulated }
      });

      if (newStatus === "kept") {
        await this.kafka.publish("cobrai.promise.kept", tenantId, {
          promise_id: promise.id,
          debt_id: debtId,
          amount: decimalToNumber(promise.amount)
        });
      }
    }

    return this.completeFinishedPlans(tenantId, debtId);
  }

  /**
   * Marca como completado todo plan de la deuda que ya no tenga cuotas
   * abiertas. `partial` cuenta como abierta: una cuota abonada a medias no
   * cierra el plan.
   */
  private async completeFinishedPlans(
    tenantId: string,
    debtId: string
  ): Promise<string[]> {
    const activePlans = await this.prisma.paymentPlan.findMany({
      where: { tenantId, debtId, status: "active", deletedAt: null },
      select: { id: true }
    });

    const completed: string[] = [];
    for (const plan of activePlans) {
      const openCount = await this.prisma.promiseToPay.count({
        where: {
          tenantId,
          planId: plan.id,
          status: { in: ["pending", "partial"] },
          deletedAt: null
        }
      });
      if (openCount === 0) {
        await this.prisma.paymentPlan.update({
          where: { id: plan.id },
          data: { status: "completed" }
        });
        completed.push(plan.id);
      }
    }
    return completed;
  }
}
