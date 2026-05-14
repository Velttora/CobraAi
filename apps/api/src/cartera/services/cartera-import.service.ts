import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { prisma } from "@renova/db";
import type { Client, Invoice, Organization, Prisma, Seller } from "@prisma/client";
import type {
  CarteraImportSummary,
  ImportRowError,
  NormalizedImportRow
} from "../models/cartera-import.models";
import { CARTERA_SOURCE, type CarteraSource } from "../ports/cartera-source.port";
import { OBJECT_STORAGE, type ObjectStorage } from "../ports/object-storage.port";

type ImportCounters = {
  createdClients: number;
  updatedClients: number;
  createdInvoices: number;
  updatedInvoices: number;
};

@Injectable()
export class CarteraImportService {
  constructor(
    @Inject(CARTERA_SOURCE) private readonly carteraSource: CarteraSource,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage
  ) {}

  async importExcel(input: {
    file: Express.Multer.File | undefined;
    clerkOrgId?: string;
    organizationName?: string;
  }): Promise<CarteraImportSummary> {
    if (!input.file) {
      throw new BadRequestException("Debes adjuntar un archivo Excel en el campo 'file'.");
    }

    const organization = await this.ensureOrganization({
      clerkOrgId: input.clerkOrgId,
      organizationName: input.organizationName
    });
    const storageKey = this.buildStorageKey(input.file.originalname);
    await this.objectStorage.putObject({
      key: storageKey,
      body: input.file.buffer,
      contentType: input.file.mimetype
    });

    const importBatch = await prisma.importBatch.create({
      data: {
        organizationId: organization.id,
        storageKey,
        status: "processing"
      }
    });

    try {
      const parsedImport = this.carteraSource.parse(input.file);
      const counters = await this.persistRows(organization.id, parsedImport.rows);
      await this.persistRowErrors(importBatch.id, parsedImport.errors);

      const status =
        parsedImport.errors.length > 0 ? "completed_with_errors" : "completed";

      await prisma.importBatch.update({
        where: {
          id: importBatch.id
        },
        data: {
          status,
          totalRows: parsedImport.rows.length + parsedImport.errors.length,
          successRows: parsedImport.rows.length,
          errorRows: parsedImport.errors.length
        }
      });

      return {
        importBatchId: importBatch.id,
        status,
        totalRows: parsedImport.rows.length + parsedImport.errors.length,
        successRows: parsedImport.rows.length,
        errorRows: parsedImport.errors.length,
        ...counters,
        errorReportUrl:
          parsedImport.errors.length > 0
            ? `/api/cartera/imports/${importBatch.id}/errors.csv`
            : undefined
      };
    } catch (error) {
      await prisma.importBatch.update({
        where: {
          id: importBatch.id
        },
        data: {
          status: "failed"
        }
      });

      throw error;
    }
  }

  async getImportStatus(importBatchId: string) {
    const importBatch = await prisma.importBatch.findUnique({
      where: {
        id: importBatchId
      },
      select: {
        id: true,
        status: true,
        totalRows: true,
        successRows: true,
        errorRows: true,
        storageKey: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!importBatch) {
      throw new BadRequestException("Import batch not found.");
    }

    const processedRows = importBatch.successRows + importBatch.errorRows;
    const progress =
      importBatch.totalRows > 0 ? Math.round((processedRows / importBatch.totalRows) * 100) : 0;

    return {
      ...importBatch,
      processedRows,
      progress
    };
  }

  private async ensureOrganization(input: {
    clerkOrgId?: string;
    organizationName?: string;
  }): Promise<Organization> {
    const clerkOrgId = input.clerkOrgId?.trim() || "dev_org";
    const name = input.organizationName?.trim() || "Renova Dev Organization";

    return prisma.organization.upsert({
      where: {
        clerkOrgId
      },
      create: {
        clerkOrgId,
        name,
        country: "CO",
        plan: "mvp"
      },
      update: {
        name
      }
    });
  }

  private async persistRows(
    organizationId: string,
    rows: NormalizedImportRow[]
  ): Promise<ImportCounters> {
    const counters: ImportCounters = {
      createdClients: 0,
      updatedClients: 0,
      createdInvoices: 0,
      updatedInvoices: 0
    };

    for (const row of rows) {
      await prisma.$transaction(async (tx) => {
        const seller = await this.findOrCreateSeller(tx, organizationId, row);
        const clientResult = await this.upsertClient(tx, organizationId, row, seller);
        const invoiceResult = await this.upsertInvoice(
          tx,
          organizationId,
          row,
          clientResult.client
        );

        if (clientResult.created) {
          counters.createdClients += 1;
        } else {
          counters.updatedClients += 1;
        }

        if (invoiceResult.created) {
          counters.createdInvoices += 1;
        } else {
          counters.updatedInvoices += 1;
        }

        await tx.collectionEvent.create({
          data: {
            clientId: clientResult.client.id,
            invoiceId: invoiceResult.invoice.id,
            eventType: "cartera_import_row_processed",
            actor: "system",
            payload: {
              rowNumber: row.rowNumber,
              sourceSystem: row.sourceSystem,
              preferredChannel: row.preferredChannel,
              lastContactAt: row.lastContactAt?.toISOString(),
              paymentPromiseDate: row.paymentPromiseDate?.toISOString(),
              creditDays: row.creditDays,
              importedRiskLabel: row.riskLabel,
              importedStatus: row.status
            }
          }
        });
      });
    }

    return counters;
  }

  private async persistRowErrors(
    importBatchId: string,
    errors: ImportRowError[]
  ): Promise<void> {
    if (errors.length === 0) {
      return;
    }

    await prisma.importRowError.createMany({
      data: errors.map((error) => ({
        importBatchId,
        rowNumber: error.rowNumber,
        reason: error.reason,
        rawData: error.rawData as Prisma.InputJsonValue
      }))
    });
  }

  private async findOrCreateSeller(
    tx: Prisma.TransactionClient,
    organizationId: string,
    row: NormalizedImportRow
  ): Promise<Seller | null> {
    if (!row.sellerName && !row.sellerEmail) {
      return null;
    }

    const seller = await tx.seller.findFirst({
      where: {
        organizationId,
        OR: [
          ...(row.sellerEmail ? [{ email: row.sellerEmail }] : []),
          ...(row.sellerName ? [{ name: row.sellerName }] : [])
        ]
      }
    });

    if (seller) {
      return tx.seller.update({
        where: {
          id: seller.id
        },
        data: {
          name: row.sellerName ?? seller.name,
          email: row.sellerEmail ?? seller.email
        }
      });
    }

    return tx.seller.create({
      data: {
        organizationId,
        name: row.sellerName ?? row.sellerEmail ?? "Vendedor sin nombre",
        email: row.sellerEmail
      }
    });
  }

  private async upsertClient(
    tx: Prisma.TransactionClient,
    organizationId: string,
    row: NormalizedImportRow,
    seller: Seller | null
  ): Promise<{ client: Client; created: boolean }> {
    const client = await tx.client.findFirst({
      where: {
        organizationId,
        OR: this.clientIdentityFilters(row)
      }
    });

    const data = {
      sellerId: seller?.id,
      documentId: row.documentId,
      name: row.name,
      phone: row.phone,
      email: row.email,
      riskScore: this.mapRiskLabelToScore(row.riskLabel),
      externalId: row.externalId,
      sourceSystem: row.sourceSystem
    };

    if (!client) {
      return {
        client: await tx.client.create({
          data: {
            organizationId,
            ...data
          }
        }),
        created: true
      };
    }

    return {
      client: await tx.client.update({
        where: {
          id: client.id
        },
        data
      }),
      created: false
    };
  }

  private async upsertInvoice(
    tx: Prisma.TransactionClient,
    organizationId: string,
    row: NormalizedImportRow,
    client: Client
  ): Promise<{ invoice: Invoice; created: boolean }> {
    const invoice = await tx.invoice.findFirst({
      where: {
        organizationId,
        clientId: client.id,
        OR: this.invoiceIdentityFilters(row)
      }
    });

    const data = {
      number: row.invoiceNumber,
      externalId: row.invoiceExternalId,
      sourceSystem: row.sourceSystem,
      amount: row.amount,
      currency: row.currency,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      daysPastDue: row.daysPastDue ?? this.daysPastDue(row.dueDate),
      status: row.status
    };

    if (!invoice) {
      return {
        invoice: await tx.invoice.create({
          data: {
            organizationId,
            clientId: client.id,
            ...data
          }
        }),
        created: true
      };
    }

    return {
      invoice: await tx.invoice.update({
        where: {
          id: invoice.id
        },
        data
      }),
      created: false
    };
  }

  private clientIdentityFilters(row: NormalizedImportRow): Prisma.ClientWhereInput[] {
    const filters: Prisma.ClientWhereInput[] = [];

    if (row.documentId) {
      filters.push({ documentId: row.documentId });
    }

    if (row.phone) {
      filters.push({ phone: row.phone });
    }

    if (row.externalId) {
      filters.push({ externalId: row.externalId });
    }

    if (filters.length === 0) {
      filters.push({
        name: row.name
      });
    }

    return filters;
  }

  private invoiceIdentityFilters(row: NormalizedImportRow): Prisma.InvoiceWhereInput[] {
    const filters: Prisma.InvoiceWhereInput[] = [];

    if (row.invoiceExternalId) {
      filters.push({ externalId: row.invoiceExternalId });
    }

    if (row.invoiceNumber) {
      filters.push({ number: row.invoiceNumber });
    }

    if (filters.length === 0) {
      filters.push({
        amount: row.amount,
        dueDate: row.dueDate
      });
    }

    return filters;
  }

  private daysPastDue(dueDate: Date): number {
    const now = new Date();
    const diff = now.getTime() - dueDate.getTime();

    return Math.max(0, Math.floor(diff / 86_400_000));
  }

  private buildStorageKey(originalName: string): string {
    const safeName = originalName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    return `imports/${Date.now()}-${safeName}`;
  }

  private mapRiskLabelToScore(riskLabel?: string): number | undefined {
    if (!riskLabel) {
      return undefined;
    }

    const normalized = riskLabel
      .toLowerCase()
      .normalize("NFD")
      .replaceAll(/\p{Diacritic}/gu, "")
      .trim();

    if (normalized === "alto") {
      return 0.9;
    }
    if (normalized === "medio") {
      return 0.6;
    }
    if (normalized === "bajo") {
      return 0.3;
    }

    return undefined;
  }
}
