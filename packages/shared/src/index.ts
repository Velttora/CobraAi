import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "agent", "seller"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const messageChannelSchema = z.enum(["whatsapp", "voice"]);
export type MessageChannel = z.infer<typeof messageChannelSchema>;

export const invoiceStatusSchema = z.enum([
  "due_soon",
  "overdue",
  "paid",
  "in_collection"
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const carteraImportRowSchema = z.object({
  documentId: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  invoiceExternalId: z.string().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().default("COP"),
  dueDate: z.coerce.date()
});

export type CarteraImportRow = z.infer<typeof carteraImportRowSchema>;
