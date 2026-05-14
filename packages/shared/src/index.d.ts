import { z } from "zod";
export declare const userRoleSchema: z.ZodEnum<{
    admin: "admin";
    agent: "agent";
    seller: "seller";
}>;
export type UserRole = z.infer<typeof userRoleSchema>;
export declare const messageChannelSchema: z.ZodEnum<{
    whatsapp: "whatsapp";
    voice: "voice";
}>;
export type MessageChannel = z.infer<typeof messageChannelSchema>;
export declare const invoiceStatusSchema: z.ZodEnum<{
    due_soon: "due_soon";
    overdue: "overdue";
    paid: "paid";
    in_collection: "in_collection";
}>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export declare const carteraImportRowSchema: z.ZodObject<{
    documentId: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    invoiceExternalId: z.ZodOptional<z.ZodString>;
    amount: z.ZodCoercedNumber<unknown>;
    currency: z.ZodDefault<z.ZodString>;
    dueDate: z.ZodCoercedDate<unknown>;
}, z.core.$strip>;
export type CarteraImportRow = z.infer<typeof carteraImportRowSchema>;
