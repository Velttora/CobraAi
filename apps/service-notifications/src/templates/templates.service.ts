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
    return this.prisma.notificationTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        channel: dto.channel,
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
