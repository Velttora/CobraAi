import type { InvoiceStatus } from "@renova/shared";

export type RawImportRow = Record<string, unknown>;

export type NormalizedImportRow = {
  rowNumber: number;
  documentId?: string;
  name: string;
  phone?: string;
  email?: string;
  sellerName?: string;
  sellerEmail?: string;
  invoiceNumber?: string;
  invoiceExternalId?: string;
  amount: number;
  currency: string;
  creditDays?: number;
  issueDate?: Date;
  dueDate: Date;
  daysPastDue?: number;
  paymentPromiseDate?: Date;
  preferredChannel?: string;
  lastContactAt?: Date;
  riskLabel?: string;
  status: InvoiceStatus;
  externalId?: string;
  sourceSystem: string;
  rawData: RawImportRow;
};

export type ImportRowError = {
  rowNumber: number;
  reason: string;
  rawData: RawImportRow;
};

export type ParsedCarteraImport = {
  rows: NormalizedImportRow[];
  errors: ImportRowError[];
};

export type CarteraImportSummary = {
  importBatchId: string;
  status: "completed" | "completed_with_errors" | "failed";
  totalRows: number;
  successRows: number;
  errorRows: number;
  createdClients: number;
  updatedClients: number;
  createdInvoices: number;
  updatedInvoices: number;
  errorReportUrl?: string;
};
