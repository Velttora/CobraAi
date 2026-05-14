import { z } from "zod";

export const carteraImportSummarySchema = z.object({
  importBatchId: z.string(),
  status: z.enum(["completed", "completed_with_errors", "failed"]),
  totalRows: z.number().int().nonnegative(),
  successRows: z.number().int().nonnegative(),
  errorRows: z.number().int().nonnegative(),
  createdClients: z.number().int().nonnegative(),
  updatedClients: z.number().int().nonnegative(),
  createdInvoices: z.number().int().nonnegative(),
  updatedInvoices: z.number().int().nonnegative(),
  errorReportUrl: z.string().optional()
});

export type CarteraImportSummary = z.infer<typeof carteraImportSummarySchema>;

export function parseCarteraImportSummary(data: unknown): CarteraImportSummary {
  return carteraImportSummarySchema.parse(data);
}
