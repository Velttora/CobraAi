import { Injectable } from "@nestjs/common";
import { carteraImportRowSchema } from "@renova/shared";
import type { InvoiceStatus } from "@renova/shared";
import * as XLSX from "xlsx";
import type {
  ImportRowError,
  NormalizedImportRow,
  ParsedCarteraImport,
  RawImportRow
} from "../models/cartera-import.models";
import type { CarteraSource } from "../ports/cartera-source.port";
import {
  canonicalizeHeader,
  normalizeAmount,
  normalizeDate,
  normalizePhone,
  readString
} from "../utils/import-normalizers";

@Injectable()
export class ExcelSource implements CarteraSource {
  parse(file: Express.Multer.File): ParsedCarteraImport {
    const workbook = XLSX.read(file.buffer, {
      cellDates: true,
      type: "buffer"
    });
    const [firstSheetName] = workbook.SheetNames;

    if (!firstSheetName) {
      return {
        rows: [],
        errors: [
          {
            rowNumber: 1,
            reason: "El archivo no contiene hojas.",
            rawData: {}
          }
        ]
      };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      return {
        rows: [],
        errors: [
          {
            rowNumber: 1,
            reason: `No se pudo leer la hoja ${firstSheetName}.`,
            rawData: {}
          }
        ]
      };
    }

    const rawRows = XLSX.utils.sheet_to_json<RawImportRow>(worksheet, {
      defval: undefined,
      raw: false
    });

    const rows: NormalizedImportRow[] = [];
    const errors: ImportRowError[] = [];

    rawRows.forEach((rawRow, index) => {
      const rowNumber = index + 2;
      const canonicalRow = this.canonicalizeRow(rawRow);
      const normalizedRow = this.normalizeRow(canonicalRow, rowNumber);
      const parsedRow = carteraImportRowSchema.safeParse(normalizedRow);

      if (!parsedRow.success) {
        errors.push({
          rowNumber,
          reason: parsedRow.error.issues.map((issue) => issue.message).join("; "),
          rawData: rawRow
        });
        return;
      }

      rows.push({
        ...parsedRow.data,
        rowNumber,
        status: this.normalizeStatus(canonicalRow.status),
        sellerName: readString(canonicalRow.sellerName),
        sellerEmail: readString(canonicalRow.sellerEmail),
        invoiceNumber: readString(canonicalRow.invoiceNumber),
        invoiceExternalId: readString(canonicalRow.invoiceExternalId),
        issueDate: normalizeDate(canonicalRow.issueDate),
        externalId: readString(canonicalRow.externalId),
        sourceSystem: readString(canonicalRow.sourceSystem) ?? "excel",
        creditDays: this.normalizeInteger(canonicalRow.creditDays),
        daysPastDue: this.normalizeInteger(canonicalRow.daysPastDue),
        paymentPromiseDate: normalizeDate(canonicalRow.paymentPromiseDate),
        preferredChannel: readString(canonicalRow.preferredChannel),
        lastContactAt: normalizeDate(canonicalRow.lastContactAt),
        riskLabel: readString(canonicalRow.riskLabel),
        rawData: rawRow
      });
    });

    return {
      rows,
      errors
    };
  }

  private canonicalizeRow(rawRow: RawImportRow): RawImportRow {
    return Object.fromEntries(
      Object.entries(rawRow).map(([header, value]) => [canonicalizeHeader(header), value])
    );
  }

  private normalizeRow(row: RawImportRow, rowNumber: number) {
    return {
      rowNumber,
      documentId: readString(row.documentId),
      name: readString(row.name),
      phone: normalizePhone(row.phone),
      email: readString(row.email),
      amount: normalizeAmount(row.amount),
      currency: readString(row.currency) ?? "COP",
      issueDate: normalizeDate(row.issueDate),
      dueDate: normalizeDate(row.dueDate),
      status: this.normalizeStatus(row.status),
      daysPastDue: this.normalizeInteger(row.daysPastDue),
      creditDays: this.normalizeInteger(row.creditDays),
      paymentPromiseDate: normalizeDate(row.paymentPromiseDate),
      preferredChannel: readString(row.preferredChannel),
      lastContactAt: normalizeDate(row.lastContactAt),
      riskLabel: readString(row.riskLabel)
    };
  }

  private normalizeInteger(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }

    const text = readString(value);
    if (!text) {
      return undefined;
    }

    const parsed = Number(text.replaceAll(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
  }

  private normalizeStatus(value: unknown): InvoiceStatus {
    const status = readString(value)
      ?.toLowerCase()
      .normalize("NFD")
      .replaceAll(/\p{Diacritic}/gu, "")
      .trim();

    if (status === "paid" || status === "pagada" || status === "pagado") {
      return "paid";
    }

    if (status === "overdue" || status === "vencida" || status === "vencido") {
      return "overdue";
    }

    if (status === "due_soon" || status === "proxima a vencer" || status === "al dia") {
      return "due_soon";
    }

    if (
      status === "in_collection" ||
      status === "en_gestion" ||
      status === "en gestion" ||
      status === "en cobranza" ||
      status === "compromiso de pago"
    ) {
      return "in_collection";
    }

    return "due_soon";
  }
}
