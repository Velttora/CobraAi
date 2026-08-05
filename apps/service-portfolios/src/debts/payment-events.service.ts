import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import {
  resolveDebtStatusAfterPayment,
  resolvePromiseStatusForPayment
} from "@cobrai/utils";
import { decimalToNumber } from "../common/utils/api.utils";
import { KafkaService } from "../kafka/kafka.service";

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

    await this.prisma.debt.update({
      where: { id: debt.id },
      data: { amountOutstanding: outstandingAfter }
    });

    await this.resolvePendingPromises(tenantId, debt.id, amount, paidFull);

    const hasActivePaymentPlan = Boolean(
      await this.prisma.paymentPlan.findFirst({
        where: {
          tenantId,
          debtId: debt.id,
          status: "active",
          deletedAt: null
        },
        select: { id: true }
      })
    );
    const pendingStandalone = await this.prisma.promiseToPay.count({
      where: {
        tenantId,
        debtId: debt.id,
        status: "pending",
        planId: null,
        deletedAt: null
      }
    });

    const status = resolveDebtStatusAfterPayment({
      currentStatus: debt.status,
      amountOutstanding: outstandingAfter,
      hasActivePaymentPlan,
      hasPendingStandalonePromise: pendingStandalone > 0
    });

    await this.prisma.debt.update({
      where: { id: debt.id },
      data: { status }
    });

    this.logger.log(
      `Deuda ${debtId} actualizada: outstanding=${outstandingAfter} status=${status}`
    );
  }

  /**
   * Cierra las promesas pendientes de la deuda cuando entra un pago, para que el
   * job de promesas vencidas no las marque como rotas habiéndose pagado.
   *
   * - Pago total: todas las promesas pendientes quedan "kept".
   * - Pago parcial: se cierra la promesa pendiente más próxima a vencer (la que
   *   el pago busca cumplir); las demás (p.ej. cuotas futuras) siguen pendientes.
   */
  private async resolvePendingPromises(
    tenantId: string,
    debtId: string,
    amountPaid: number,
    paidFull: boolean
  ): Promise<void> {
    const pending = await this.prisma.promiseToPay.findMany({
      where: { tenantId, debtId, status: "pending", deletedAt: null },
      orderBy: { promisedDate: "asc" }
    });
    if (pending.length === 0) return;

    const targets = paidFull ? pending : pending.slice(0, 1);
    for (const promise of targets) {
      const newStatus = resolvePromiseStatusForPayment({
        promiseAmount: decimalToNumber(promise.amount),
        amountPaid,
        debtPaidFull: paidFull
      });
      await this.prisma.promiseToPay.update({
        where: { id: promise.id },
        data: { status: newStatus }
      });

      if (newStatus === "kept") {
        await this.kafka.publish("cobrai.promise.kept", tenantId, {
          promise_id: promise.id,
          debt_id: debtId,
          amount: decimalToNumber(promise.amount)
        });
      }
    }

    await this.completeFinishedPlans(tenantId, debtId);
  }

  /**
   * Marca como completado todo plan de pagos de la deuda que ya no tenga cuotas
   * pendientes (todas pagadas).
   */
  private async completeFinishedPlans(
    tenantId: string,
    debtId: string
  ): Promise<void> {
    const activePlans = await this.prisma.paymentPlan.findMany({
      where: { tenantId, debtId, status: "active", deletedAt: null },
      select: { id: true }
    });

    for (const plan of activePlans) {
      const pendingCount = await this.prisma.promiseToPay.count({
        where: { tenantId, planId: plan.id, status: "pending", deletedAt: null }
      });
      if (pendingCount === 0) {
        await this.prisma.paymentPlan.update({
          where: { id: plan.id },
          data: { status: "completed" }
        });
      }
    }
  }
}
