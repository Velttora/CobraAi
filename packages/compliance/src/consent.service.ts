import { PrismaService, type ConsentSource, type ContactChannel } from "@cobrai/db";

export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActiveConsent(
    tenantId: string,
    debtorId: string,
    channel: ContactChannel
  ): Promise<boolean> {
    const consent = await this.prisma.contactConsent.findFirst({
      where: {
        tenantId,
        debtorId,
        channel,
        revokedAt: null,
        deletedAt: null
      }
    });
    return Boolean(consent);
  }

  async registerConsent(
    tenantId: string,
    debtorId: string,
    channel: ContactChannel,
    source: ConsentSource
  ) {
    return this.prisma.contactConsent.create({
      data: {
        tenantId,
        debtorId,
        channel,
        source,
        consentedAt: new Date()
      }
    });
  }

  async revokeConsent(
    tenantId: string,
    debtorId: string,
    channel: ContactChannel
  ): Promise<void> {
    await this.prisma.contactConsent.updateMany({
      where: { tenantId, debtorId, channel, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
}
