import {
  AgingBucket,
  ContactChannel,
  DebtStatus,
  PrismaClient,
  RiskSegment,
  TenantPlan,
  UserRole,
  WorkflowAction,
  WorkflowTrigger,
  DebtorType
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { applyPackageToPortfolio } from "@cobrai/workflow-packages";
import {
  bestChannelForScores,
  calculatePriorityScore,
  calculateRecoveryScore,
  deriveManagementSegment
} from "@cobrai/utils";
import { loadSeedEnv } from "./load-seed-env";
import { resolveSeedTenant } from "./resolve-seed-tenant";

const prisma = new PrismaClient();

export type RunSeedOptions = {
  requireClerkAlign?: boolean;
};

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function collectionQuarterFor(date: Date): string {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  return `Q${Math.floor(month / 3) + 1}-${year}`;
}

type DebtorSeed = {
  externalRef: string;
  name: string;
  type: DebtorType;
  taxId?: string;
  phones: string[];
  email?: string;
  address: Record<string, string>;
  whatsappOptIn: boolean;
  country: "MX" | "CO";
};

const DEBTOR_SEEDS: DebtorSeed[] = [
  {
    externalRef: "DEB-MX-001",
    name: "Juan Pérez López",
    type: DebtorType.person,
    taxId: "PELJ800101HDFRRN09",
    phones: ["+525551234567"],
    email: "juan.perez@email.com",
    address: { city: "Ciudad de México", country: "MX" },
    whatsappOptIn: true,
    country: "MX"
  },
  {
    externalRef: "DEB-MX-002",
    name: "María Hernández Ruiz",
    type: DebtorType.person,
    taxId: "HERM850322MDFRZR04",
    phones: ["+525558765432"],
    email: "maria.hernandez@email.com",
    address: { city: "Guadalajara", country: "MX" },
    whatsappOptIn: true,
    country: "MX"
  },
  {
    externalRef: "DEB-MX-003",
    name: "Comercializadora del Norte SA de CV",
    type: DebtorType.company,
    taxId: "CDN940101ABC",
    phones: ["+525559876543", "+525551112233"],
    email: "cobranza@cdnorte.mx",
    address: { city: "Monterrey", country: "MX" },
    whatsappOptIn: false,
    country: "MX"
  },
  {
    externalRef: "DEB-MX-004",
    name: "Roberto Sánchez Vega",
    type: DebtorType.person,
    phones: ["+525554443322"],
    email: "roberto.sanchez@email.com",
    address: { city: "Puebla", country: "MX" },
    whatsappOptIn: false,
    country: "MX"
  },
  {
    externalRef: "DEB-MX-005",
    name: "Distribuidora Pacífico SA de CV",
    type: DebtorType.company,
    taxId: "DPA010101XYZ",
    phones: ["+525557778899"],
    email: "finanzas@dpacifico.mx",
    address: { city: "Tijuana", country: "MX" },
    whatsappOptIn: true,
    country: "MX"
  },
  {
    externalRef: "DEB-CO-001",
    name: "Ana María Rodríguez",
    type: DebtorType.person,
    taxId: "1234567890",
    phones: ["+573001234567"],
    email: "ana.rodriguez@email.com",
    address: { city: "Bogotá", country: "CO" },
    whatsappOptIn: true,
    country: "CO"
  },
  {
    externalRef: "DEB-CO-002",
    name: "Carlos Eduardo Gómez",
    type: DebtorType.person,
    taxId: "9876543210",
    phones: ["+573109876543"],
    email: "carlos.gomez@email.com",
    address: { city: "Medellín", country: "CO" },
    whatsappOptIn: true,
    country: "CO"
  },
  {
    externalRef: "DEB-CO-003",
    name: "Inversiones Andina SAS",
    type: DebtorType.company,
    taxId: "900123456-1",
    phones: ["+573204567890"],
    email: "cartera@inversionesandina.co",
    address: { city: "Cali", country: "CO" },
    whatsappOptIn: false,
    country: "CO"
  },
  {
    externalRef: "DEB-CO-004",
    name: "Laura Patricia Vargas",
    type: DebtorType.person,
    phones: ["+573155667788"],
    email: "laura.vargas@email.com",
    address: { city: "Barranquilla", country: "CO" },
    whatsappOptIn: true,
    country: "CO"
  },
  {
    externalRef: "DEB-CO-005",
    name: "Tecnología del Caribe Ltda",
    type: DebtorType.company,
    taxId: "800987654-3",
    phones: ["+573189998877"],
    email: "pagos@teccaribe.co",
    address: { city: "Cartagena", country: "CO" },
    whatsappOptIn: false,
    country: "CO"
  },
  {
    externalRef: "DEB-MX-006",
    name: "Fernanda López Díaz",
    type: DebtorType.person,
    phones: ["+525556667788"],
    address: { city: "Querétaro", country: "MX" },
    whatsappOptIn: true,
    country: "MX"
  },
  {
    externalRef: "DEB-CO-006",
    name: "Diego Andrés Muñoz",
    type: DebtorType.person,
    phones: ["+573144556677"],
    address: { city: "Bucaramanga", country: "CO" },
    whatsappOptIn: false,
    country: "CO"
  },
  {
    externalRef: "DEB-MX-007",
    name: "Servicios Integrales del Bajío SA de CV",
    type: DebtorType.company,
    taxId: "SIB120101QWE",
    phones: ["+524771234567"],
    email: "contacto@sibajio.mx",
    address: { city: "León", country: "MX" },
    whatsappOptIn: true,
    country: "MX"
  },
  {
    externalRef: "DEB-CO-007",
    name: "Valentina Restrepo",
    type: DebtorType.person,
    phones: ["+573177889900"],
    email: "valentina.restrepo@email.com",
    address: { city: "Pereira", country: "CO" },
    whatsappOptIn: true,
    country: "CO"
  },
  {
    externalRef: "DEB-MX-008",
    name: "Grupo Industrial del Sureste SA de CV",
    type: DebtorType.company,
    taxId: "GIS990101RTY",
    phones: ["+529991234567"],
    email: "tesoreria@gissureste.mx",
    address: { city: "Mérida", country: "MX" },
    whatsappOptIn: false,
    country: "MX"
  }
];

/** 30 deudas: distribución de aging según prompt. */
const AGING_PLAN: Array<{
  bucket: AgingBucket;
  count: number;
  minDays: number;
  maxDays: number;
}> = [
  { bucket: "d0_30", count: 10, minDays: 5, maxDays: 28 },
  { bucket: "d31_60", count: 8, minDays: 35, maxDays: 58 },
  { bucket: "d61_90", count: 6, minDays: 65, maxDays: 88 },
  { bucket: "d91_180", count: 4, minDays: 100, maxDays: 165 },
  { bucket: "d180_plus", count: 2, minDays: 195, maxDays: 240 }
];

/** Borra todos los tenants, usuarios, carteras y datos demo (local o prod). */
export async function clearDatabase(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.workflowExecution.deleteMany();
  await prisma.workflowRule.deleteMany();
  await prisma.portfolioPackageApplication.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.contactConsent.deleteMany();
  await prisma.notificationTemplate.deleteMany();
  await prisma.paymentLink.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.promiseToPay.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.debt.deleteMany();
  await prisma.portfolioPackageApplication.deleteMany();
  await prisma.portfolio.deleteMany();
  await prisma.debtor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}

export async function runSeed(options: RunSeedOptions = {}): Promise<void> {
  loadSeedEnv();
  console.info("Seeding CobraAI database…");

  const seedTenant = await resolveSeedTenant();

  if (options.requireClerkAlign && seedTenant.source === "default") {
    throw new Error(
      "Seed cancelado: no hay SEED_TENANT_ID ni organización en Clerk."
    );
  }

  if (seedTenant.source === "default") {
    console.warn(
      "⚠ Usando tenant demo fijo (org_demo_fintech). Para ver datos al loguearte con Clerk ejecuta: pnpm db:seed:align"
    );
  } else {
    console.info(
      `Tenant objetivo: ${seedTenant.id} (${seedTenant.name}) — origen: ${seedTenant.source}`
    );
  }

  await clearDatabase();

  const passwordHash = await bcrypt.hash("demo123", 12);

  const tenant = await prisma.tenant.create({
    data: {
      id: seedTenant.id,
      name: seedTenant.name,
      slug: seedTenant.slug,
      plan: TenantPlan.growth,
      settings: {
        default_currency: "COP",
        countries: ["CO", "MX"],
        contact_window: "09:00-18:00"
      },
      isActive: true
    }
  });

  const admin = await prisma.user.create({
    data: {
      id: "user_demo_admin",
      tenantId: tenant.id,
      email: "admin@demo.com",
      name: "Admin Demo",
      role: UserRole.admin,
      passwordHash,
      isActive: true
    }
  });

  await prisma.user.create({
    data: {
      id: "user_demo_agent",
      tenantId: tenant.id,
      email: "agent@demo.com",
      name: "Agente Demo",
      role: UserRole.agent,
      passwordHash,
      isActive: true
    }
  });

  const portfolioNone = await prisma.portfolio.create({
    data: {
      tenantId: tenant.id,
      name: "Cartera sin automatización",
      description: "Portafolio demo sin estrategia configurada",
      status: "active",
      currency: "COP",
      automationStatus: "none",
      importedAt: new Date(),
      createdById: admin.id
    }
  });

  const portfolioPackage = await prisma.portfolio.create({
    data: {
      tenantId: tenant.id,
      name: "Cartera PyME Fintech",
      description: "Automatización con paquete pre-configurado",
      status: "active",
      currency: "COP",
      automationStatus: "none",
      importedAt: new Date(),
      createdById: admin.id
    }
  });

  const portfolioCustom = await prisma.portfolio.create({
    data: {
      tenantId: tenant.id,
      name: "Cartera empresa grande",
      description: "Reglas personalizadas por portafolio",
      status: "active",
      currency: "COP",
      automationStatus: "custom",
      importedAt: new Date(),
      createdById: admin.id
    }
  });

  const portfolioByDebtIndex = (idx: number): string => {
    if (idx % 3 === 0) return portfolioNone.id;
    if (idx % 3 === 1) return portfolioPackage.id;
    return portfolioCustom.id;
  };

  const debtors = await Promise.all(
    DEBTOR_SEEDS.map((seed) =>
      prisma.debtor.create({
        data: {
          tenantId: tenant.id,
          externalRef: seed.externalRef,
          name: seed.name,
          type: seed.type,
          taxId: seed.taxId,
          phones: seed.phones,
          email: seed.email,
          address: seed.address,
          whatsappOptIn: seed.whatsappOptIn,
          bestChannel: seed.whatsappOptIn ? "whatsapp" : "email",
          bestContactTime: {
            days: ["mon", "tue", "wed", "thu", "fri"],
            hours: seed.country === "CO" ? "09:00-18:00" : "10:00-19:00"
          }
        }
      })
    )
  );

  const debtRows: Array<{
    debtorIndex: number;
    bucket: AgingBucket;
    daysPastDue: number;
    amount: number;
    currency: string;
  }> = [];

  let debtIndex = 0;
  for (const plan of AGING_PLAN) {
    for (let i = 0; i < plan.count; i += 1) {
      const span = plan.maxDays - plan.minDays;
      const daysPastDue = plan.minDays + (span > 0 ? (i * span) / plan.count : 0);
      const debtorIndex = debtIndex % debtors.length;
      const debtorSeed = DEBTOR_SEEDS[debtorIndex];
      if (!debtorSeed) {
        throw new Error("Missing debtor seed");
      }
      debtRows.push({
        debtorIndex,
        bucket: plan.bucket,
        daysPastDue: Math.round(daysPastDue),
        amount: 500_000 + debtIndex * 47_500,
        currency: debtorSeed.country === "MX" ? "MXN" : "COP"
      });
      debtIndex += 1;
    }
  }

  const maxSeedAmount = Math.max(...debtRows.map((r) => r.amount), 1);

  let totalAmount = 0;
  const createdDebts = await Promise.all(
    debtRows.map(async (row, idx) => {
      const debtor = debtors[row.debtorIndex];
      if (!debtor) {
        throw new Error("Missing debtor");
      }
      const dueDate = daysAgo(row.daysPastDue);
      const agingDays = row.daysPastDue;
      const amount = row.amount;
      const aiScore = calculateRecoveryScore({
        aging_days: agingDays,
        amount_outstanding: amount,
        has_whatsapp: debtor.whatsappOptIn,
        has_phone: true,
        has_email: Boolean(debtor.email),
        promises_broken_count: 0,
        previous_contacts_count: 0
      });
      const priorityScore = calculatePriorityScore(
        aiScore,
        amount,
        null,
        maxSeedAmount
      );
      const aiSegment = deriveManagementSegment({
        ai_score: aiScore,
        priority_score: priorityScore,
        aging_days: agingDays,
        amount_outstanding: amount
      });
      totalAmount += amount;

      return prisma.debt.create({
        data: {
          tenantId: tenant.id,
          portfolioId: portfolioByDebtIndex(idx),
          debtorId: debtor.id,
          externalRef: `DEBT-${String(idx + 1).padStart(4, "0")}`,
          amountOriginal: amount,
          amountOutstanding: amount,
          currency: row.currency,
          dueDate,
          collectionQuarter: collectionQuarterFor(dueDate),
          agingBucket: row.bucket,
          status:
            row.bucket === "d180_plus"
              ? DebtStatus.legal_risk
              : row.bucket === "d0_30"
                ? DebtStatus.active
                : DebtStatus.contacted,
          aiScore,
          priorityScore,
          aiSegment,
          riskLevel: aiSegment,
          bestChannel: bestChannelForScores(
            aiScore,
            priorityScore,
            debtor.whatsappOptIn
          ),
          metadata: {
            seed: true,
            invoice_number: `INV-2026-${idx + 1}`
          }
        }
      });
    })
  );

  const deferredPlans: Array<{
    suffix: string;
    dueDate: Date;
    status: DebtStatus;
    bucket: AgingBucket;
    amount: number;
  }> = [
    { suffix: "Q3-1", dueDate: new Date("2026-07-15"), status: "future", bucket: "future", amount: 800_000 },
    { suffix: "Q3-2", dueDate: new Date("2026-08-22"), status: "future", bucket: "future", amount: 920_000 },
    { suffix: "Q3-3", dueDate: new Date("2026-09-10"), status: "future", bucket: "future", amount: 750_000 },
    { suffix: "Q3-4", dueDate: daysFromNow(20), status: "upcoming", bucket: "upcoming", amount: 680_000 },
    { suffix: "Q3-5", dueDate: daysFromNow(45), status: "future", bucket: "future", amount: 610_000 },
    { suffix: "Q4-1", dueDate: new Date("2026-10-15"), status: "future", bucket: "future", amount: 540_000 },
    { suffix: "Q4-2", dueDate: new Date("2026-11-20"), status: "future", bucket: "future", amount: 490_000 },
    { suffix: "Q4-3", dueDate: new Date("2026-12-05"), status: "future", bucket: "future", amount: 430_000 }
  ];

  let deferredCount = 0;
  for (const plan of deferredPlans) {
    const debtor = debtors[deferredCount % debtors.length];
    if (!debtor) continue;
    totalAmount += plan.amount;
    deferredCount += 1;
    await prisma.debt.create({
      data: {
        tenantId: tenant.id,
        portfolioId: portfolioByDebtIndex(createdDebts.length + deferredCount),
        debtorId: debtor.id,
        externalRef: `DEBT-DEF-${plan.suffix}`,
        amountOriginal: plan.amount,
        amountOutstanding: plan.amount,
        currency: "COP",
        dueDate: plan.dueDate,
        collectionQuarter: collectionQuarterFor(plan.dueDate),
        agingBucket: plan.bucket,
        status: plan.status,
        metadata: { seed: true, deferred: true }
      }
    });
  }

  await prisma.portfolio.update({
    where: { id: portfolioNone.id },
    data: {
      totalDebts: Math.ceil((createdDebts.length + deferredCount) / 3),
      totalAmount: totalAmount / 3
    }
  });
  await prisma.portfolio.update({
    where: { id: portfolioPackage.id },
    data: {
      totalDebts: Math.ceil((createdDebts.length + deferredCount) / 3),
      totalAmount: totalAmount / 3
    }
  });
  await prisma.portfolio.update({
    where: { id: portfolioCustom.id },
    data: {
      totalDebts: Math.floor((createdDebts.length + deferredCount) / 3),
      totalAmount: totalAmount / 3
    }
  });

  await prisma.notificationTemplate.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: "recordatorio_pago",
        channel: "email",
        content:
          "Hola {{debtor_name}}, tienes un saldo pendiente de {{amount}} con vencimiento {{due_date}}.",
        variables: ["debtor_name", "amount", "due_date"],
        isApproved: true,
        language: "es"
      },
      {
        tenantId: tenant.id,
        name: "recordatorio_whatsapp",
        channel: "whatsapp",
        content:
          "Estimado/a {{debtor_name}}, le recordamos su obligación por {{amount}}. Pague aquí: {{payment_link}}",
        variables: ["debtor_name", "amount", "payment_link"],
        isApproved: true,
        language: "es"
      },
      {
        tenantId: tenant.id,
        name: "plan_pago",
        channel: "sms",
        content:
          "{{debtor_name}}, aprobamos su plan de pago en {{installments}} cuotas. Detalle: {{link}}",
        variables: ["debtor_name", "installments", "link"],
        isApproved: true,
        language: "es"
      },
      {
        tenantId: tenant.id,
        name: "confirmacion_pago",
        channel: "email",
        content:
          "Confirmamos el recibo de {{amount}} para la referencia {{external_ref}}. Gracias.",
        variables: ["amount", "external_ref"],
        isApproved: true,
        language: "es"
      },
      {
        tenantId: tenant.id,
        name: "escalamiento_legal",
        channel: "email",
        content:
          "Aviso importante: la cuenta {{external_ref}} ingresará a revisión legal en {{days}} días.",
        variables: ["external_ref", "days"],
        isApproved: false,
        language: "es"
      }
    ]
  });

  await applyPackageToPortfolio(prisma, {
    tenantId: tenant.id,
    portfolioId: portfolioPackage.id,
    packageId: "pyme_fintech",
    overwrite: true,
    appliedById: admin.id
  });

  await prisma.workflowRule.createMany({
    data: [
      {
        tenantId: tenant.id,
        portfolioId: portfolioCustom.id,
        name: "Score bajo — WhatsApp",
        trigger: WorkflowTrigger.score_updated,
        condition: { ai_score: { lt: 40 }, whatsapp_opt_in: true },
        action: WorkflowAction.send_notification,
        channel: "whatsapp",
        delayHours: 2,
        priority: 20,
        isActive: true
      },
      {
        tenantId: tenant.id,
        portfolioId: portfolioCustom.id,
        name: "Promesa rota — escalar",
        trigger: WorkflowTrigger.promise_broken,
        condition: {},
        action: WorkflowAction.escalate_human,
        channel: "voice",
        delayHours: 4,
        priority: 5,
        isActive: true
      },
      {
        tenantId: tenant.id,
        portfolioId: portfolioCustom.id,
        name: "Aging 90+ — SMS urgente",
        trigger: WorkflowTrigger.schedule,
        condition: { aging_bucket: ["d91_180", "d180_plus"] },
        action: WorkflowAction.send_notification,
        channel: "sms",
        delayHours: 0,
        priority: 30,
        isActive: true
      }
    ]
  });

  await prisma.portfolioPackageApplication.create({
    data: {
      tenantId: tenant.id,
      portfolioId: portfolioCustom.id,
      action: "custom",
      appliedById: admin.id
    }
  });

  for (const debtor of debtors.filter((d) => d.whatsappOptIn)) {
    await prisma.contactConsent.create({
      data: {
        tenantId: tenant.id,
        debtorId: debtor.id,
        channel: "whatsapp",
        consentedAt: new Date(),
        source: "import"
      }
    });
  }

  for (const debtor of debtors.filter((d) => d.email)) {
    await prisma.contactConsent.create({
      data: {
        tenantId: tenant.id,
        debtorId: debtor.id,
        channel: "email",
        consentedAt: new Date(),
        source: "import"
      }
    });
  }

  for (const debtor of debtors.filter(
    (d) => Array.isArray(d.phones) && (d.phones as string[]).length > 0
  )) {
    await prisma.contactConsent.create({
      data: {
        tenantId: tenant.id,
        debtorId: debtor.id,
        channel: "sms",
        consentedAt: new Date(),
        source: "import"
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: admin.id,
      action: "seed.completed",
      resourceType: "tenant",
      resourceId: portfolioPackage.id,
      changes: {
        debtors: debtors.length,
        debts: createdDebts.length + deferredCount,
        portfolios: 3,
        templates: 5,
        workflow_rules: "portfolio-scoped"
      },
      ipAddress: "127.0.0.1",
      userAgent: "cobrai-seed/1.0"
    }
  });

  console.info("Seed completed:", {
    tenant_id: tenant.id,
    tenant: tenant.slug,
    users: 2,
    debtors: debtors.length,
    debts: createdDebts.length,
    portfolios: [
      portfolioNone.name,
      portfolioPackage.name,
      portfolioCustom.name
    ]
  });
}
