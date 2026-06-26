import { Injectable, Logger } from "@nestjs/common";
import { PrismaService, type ContactChannel } from "@cobrai/db";
import { KafkaService } from "../kafka/kafka.service";

export type PlanInstallmentInput = {
  installmentNumber: number;
  amount: number;
  /** Fecha de vencimiento YYYY-MM-DD. */
  dueDate: string;
};

/**
 * Crea acuerdos de pago en cuotas. Cada cuota se materializa como un
 * PromiseToPay con planId/installmentNumber, de modo que reutiliza el
 * seguimiento de promesas (recordatorios, incumplimiento y cierre por pago).
 */
@Injectable()
export class PaymentPlanService {
  private readonly logger = new Logger(PaymentPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService
  ) {}

  /**
   * Devuelve el planId creado, o null si los datos no forman un plan válido
   * (un plan requiere al menos 2 cuotas; con una sola, es una promesa simple).
   */
  async createPlan(
    tenantId: string,
    input: {
      debtId: string;
      installments: PlanInstallmentInput[];
      createdVia?: ContactChannel;
      notes?: string;
    }
  ): Promise<string | null> {
    const installments = input.installments
      .filter((i) => i.amount > 0 && Boolean(i.dueDate))
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    if (installments.length < 2) {
      return null;
    }

    const total = installments.reduce((sum, i) => sum + i.amount, 0);

    const planId = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.paymentPlan.create({
        data: {
          tenantId,
          debtId: input.debtId,
          totalAmount: total,
          installmentsCount: installments.length,
          createdVia: input.createdVia,
          notes: input.notes
        }
      });

      // Retirar promesas sueltas pendientes para no duplicar el seguimiento.
      await tx.promiseToPay.updateMany({
        where: {
          tenantId,
          debtId: input.debtId,
          status: "pending",
          planId: null,
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });

      await tx.promiseToPay.createMany({
        data: installments.map((i) => ({
          tenantId,
          debtId: input.debtId,
          planId: plan.id,
          installmentNumber: i.installmentNumber,
          amount: i.amount,
          promisedDate: new Date(i.dueDate),
          status: "pending" as const
        }))
      });

      await tx.debt.updateMany({
        where: { id: input.debtId, tenantId },
        data: { status: "plan" }
      });

      return plan.id;
    });

    await this.kafka.publish("cobrai.payment_plan.created", tenantId, {
      debt_id: input.debtId,
      plan_id: planId,
      total_amount: total,
      installments_count: installments.length,
      created_via: input.createdVia ?? null,
      installments: installments.map((i) => ({
        installment_number: i.installmentNumber,
        amount: i.amount,
        due_date: i.dueDate
      }))
    });

    this.logger.log(
      `Plan de pagos creado debt=${input.debtId} plan=${planId} ` +
        `cuotas=${installments.length} total=${total}`
    );
    return planId;
  }
}
