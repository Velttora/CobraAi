import { Module } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import {
  AuditService,
  ComplianceService,
  ConsentService,
  OptOutService
} from "@cobrai/compliance";

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
      provide: ComplianceService,
      useFactory: (
        prisma: PrismaService,
        consent: ConsentService,
        optOut: OptOutService,
        audit: AuditService
      ) => new ComplianceService(prisma, consent, optOut, audit),
      inject: [PrismaService, ConsentService, OptOutService, AuditService]
    }
  ],
  exports: [ComplianceService, AuditService]
})
export class ComplianceModule {}
