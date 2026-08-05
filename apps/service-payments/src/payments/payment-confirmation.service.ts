import {
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { PrismaService, type PaymentGateway, type PaymentMethod, type PaymentProvider } from "@cobrai/db";
import { KafkaService } from "../kafka/kafka.service";
import { decimalToNumber } from "../common/utils/api.utils";

export type ConfirmPaymentInput = {
  tenantId: string;
  debtId: string;
  amount: number;
  currency: string;
  gateway: PaymentGateway;
  provider: PaymentProvider;
  method?: PaymentMethod;
  gatewayRef: string;
  paymentLinkId?: string;
};

@Injectable()
export class PaymentConfirmationService {
  private readonly logger = new Logger(PaymentConfirmationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService
  ) {}

  async confirmPayment(input: ConfirmPaymentInput) {
    const existing = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { gatewayRef: input.gatewayRef },
          { idempotencyKey: input.gatewayRef }
        ],
        deletedAt: null
      }
    });

    if (existing?.status === "confirmed") {
      this.logger.log(`Pago idempotente ${input.gatewayRef} ya confirmado`);
      return { payment: existing, duplicate: true };
    }

    const debt = await this.prisma.debt.findFirst({
      where: { id: input.debtId, tenantId: input.tenantId, deletedAt: null }
    });
    if (!debt) {
      throw new NotFoundException("Deuda no encontrada");
    }

    const outstandingBefore = decimalToNumber(debt.amountOutstanding);
    const outstandingAfter = Math.max(0, outstandingBefore - input.amount);

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          tenantId: input.tenantId,
          debtId: input.debtId,
          amount: input.amount,
          currency: input.currency,
          gateway: input.gateway,
          provider: input.provider,
          method: input.method,
          gatewayRef: input.gatewayRef,
          idempotencyKey: input.gatewayRef,
          status: "confirmed",
          confirmedAt: new Date()
        }
      });

      if (input.paymentLinkId) {
        await tx.paymentLink.updateMany({
          where: { id: input.paymentLinkId, tenantId: input.tenantId },
          data: {
            status: "used",
            usedAt: new Date(),
            paymentId: created.id
          }
        });
      }

      return created;
    });

    await this.kafka.publish("cobrai.payment.confirmed", input.tenantId, {
      payment_id: payment.id,
      debt_id: input.debtId,
      amount: input.amount,
      currency: input.currency,
      gateway: input.gateway,
      gateway_ref: input.gatewayRef,
      amount_outstanding: outstandingAfter
    });

    return { payment, duplicate: false, amount_outstanding: outstandingAfter };
  }
}
