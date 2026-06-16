import { Injectable } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import type { CreateTemplateDto, UpdateTemplateDto } from "./dto/template.dto";

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.notificationTemplate.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" }
    });
  }

  async create(tenantId: string, dto: CreateTemplateDto) {
    const existing = await this.prisma.notificationTemplate.findFirst({
      where: { tenantId, name: dto.name, channel: dto.channel }
    });

    if (existing) {
      return this.prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: {
          subject: dto.subject ?? existing.subject,
          content: dto.content,
          variables: (dto.variables ?? existing.variables) as never,
          isApproved: dto.is_approved ?? existing.isApproved,
          deletedAt: null
        }
      });
    }

    return this.prisma.notificationTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        channel: dto.channel,
        subject: dto.subject ?? null,
        content: dto.content,
        variables: dto.variables ?? [],
        language: dto.language ?? "es",
        isApproved: dto.is_approved ?? false
      }
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTemplateDto) {
    return this.prisma.notificationTemplate.update({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.channel !== undefined && { channel: dto.channel }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.variables !== undefined && { variables: dto.variables })
      }
    });
  }

  async delete(tenantId: string, id: string) {
    return this.prisma.notificationTemplate.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() }
    });
  }
}
