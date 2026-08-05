import { Module } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import {
  AuditService,
  ComplianceService,
  ConsentService,
  OptOutService
} from "@cobrai/compliance";
import { TenantIntegrationService } from "@cobrai/integrations";

@Module({
  providers: [
    {
      provide: ConsentService,
      useFactory: (prisma: PrismaService) => new ConsentService(prisma),
      inject: [PrismaService]
    },
    {
      provide: OptOutService,
      useFactory: (prisma: PrismaService) => new OptOutService(prisma),
      inject: [PrismaService]
    },
    {
      provide: AuditService,
      useFactory: (prisma: PrismaService) => new AuditService(prisma),
      inject: [PrismaService]
    },
    {
      provide: TenantIntegrationService,
      useFactory: (prisma: PrismaService) => new TenantIntegrationService(prisma),
      inject: [PrismaService]
    },
    {
      provide: ComplianceService,
      useFactory: (
        prisma: PrismaService,
        consent: ConsentService,
        optOut: OptOutService,
        audit: AuditService,
        integrations: TenantIntegrationService
      ) => new ComplianceService(prisma, consent, optOut, audit, integrations),
      inject: [
        PrismaService,
        ConsentService,
        OptOutService,
        AuditService,
        TenantIntegrationService
      ]
    }
  ],
  exports: [ComplianceService, AuditService, TenantIntegrationService]
})
export class ComplianceModule {}
