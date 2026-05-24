import { PrismaService, type ContactChannel, type Debtor } from "@cobrai/db";

export class OptOutService {
  constructor(private readonly prisma: PrismaService) {}

  isGlobalOptOut(debtor: Debtor): boolean {
    const address = debtor.address as { opt_out_global?: boolean } | null;
    return Boolean(address?.opt_out_global);
  }

  isChannelOptOut(debtor: Debtor, channel: ContactChannel): boolean {
    const address = debtor.address as { opt_out_channels?: ContactChannel[] } | null;
    return Boolean(address?.opt_out_channels?.includes(channel));
  }

  async setGlobalOptOut(tenantId: string, debtorId: string): Promise<void> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId, deletedAt: null }
    });
    if (!debtor) return;

    await this.prisma.debtor.update({
      where: { id: debtorId },
      data: {
        address: {
          ...(debtor.address as object),
          opt_out_global: true
        }
      }
    });
  }

  async setChannelOptOut(
    tenantId: string,
    debtorId: string,
    channel: ContactChannel
  ): Promise<void> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId, deletedAt: null }
    });
    if (!debtor) return;

    const current = (debtor.address as { opt_out_channels?: ContactChannel[] })
      .opt_out_channels ?? [];

    await this.prisma.debtor.update({
      where: { id: debtorId },
      data: {
        address: {
          ...(debtor.address as object),
          opt_out_channels: [...new Set([...current, channel])]
        }
      }
    });
  }
}
