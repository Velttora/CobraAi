import { Injectable, Logger } from "@nestjs/common";
import { PrismaService, type MessageStatus } from "@cobrai/db";
import { ConsentService } from "@cobrai/compliance";
import { parseMessagePayload } from "../common/utils/api.utils";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService
  ) {}

  async handleSendGrid(events: SendGridEvent[]): Promise<void> {
    for (const event of events) {
      this.logger.log(`SendGrid ${event.event} → ${event.email}`);
      if (!event.sg_message_id) continue;

      await this.updateMessageByProviderId(event.sg_message_id, (status) => {
        if (event.event === "open") return "read";
        if (event.event === "delivered") return "delivered";
        if (event.event === "bounce") return "failed";
        return status;
      });

      if (event.event === "bounce" && event.email) {
        await this.handleEmailBounce(event.email);
      }
    }
  }

  async handleTwilio(payload: TwilioWebhookPayload): Promise<void> {
    this.logger.log(`Twilio ${payload.MessageStatus} → ${payload.To}`);

    if (payload.MessageSid) {
      await this.updateMessageByProviderId(payload.MessageSid, () => {
        if (payload.MessageStatus === "delivered") return "delivered";
        if (payload.MessageStatus === "failed") return "failed";
        return "sent";
      });
    }

    const body = payload.Body?.trim().toUpperCase();
    if (body === "STOP" || body === "UNSUBSCRIBE") {
      if (payload.From) {
        await this.handleSmsOptOut(payload.From);
      }
    }
  }

  async handleWhatsApp(payload: Record<string, unknown>): Promise<void> {
    this.logger.log("WhatsApp webhook (stub)", payload);
  }

  private async updateMessageByProviderId(
    providerId: string,
    mapStatus: (current: MessageStatus) => MessageStatus
  ): Promise<void> {
    const messages = await this.prisma.message.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 500
    });

    for (const message of messages) {
      const parsed = parseMessagePayload(message.content);
      if (parsed.provider_message_id !== providerId) continue;
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: mapStatus(message.status) }
      });
      return;
    }
  }

  private async handleEmailBounce(email: string): Promise<void> {
    const debtors = await this.prisma.debtor.findMany({
      where: { email, deletedAt: null },
      take: 20
    });

    for (const debtor of debtors) {
      await this.consent.revokeConsent(debtor.tenantId, debtor.id, "email");
      await this.prisma.debtor.update({
        where: { id: debtor.id },
        data: {
          address: {
            ...(debtor.address as object),
            opt_out_channels: ["email"]
          }
        }
      });
    }
  }

  private async handleSmsOptOut(from: string): Promise<void> {
    const debtors = await this.prisma.debtor.findMany({
      where: { deletedAt: null },
      take: 200
    });

    for (const debtor of debtors) {
      const phones = Array.isArray(debtor.phones)
        ? (debtor.phones as string[])
        : [];
      if (!phones.some((p) => from.includes(p.replace(/\D/g, "")))) continue;
      await this.consent.revokeConsent(debtor.tenantId, debtor.id, "sms");
    }
  }
}

type SendGridEvent = {
  email?: string;
  event?: string;
  sg_message_id?: string;
};

type TwilioWebhookPayload = {
  MessageSid?: string;
  MessageStatus?: string;
  From?: string;
  To?: string;
  Body?: string;
};
