"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.carteraImportRowSchema = exports.invoiceStatusSchema = exports.messageChannelSchema = exports.userRoleSchema = void 0;
const zod_1 = require("zod");
exports.userRoleSchema = zod_1.z.enum(["admin", "agent", "seller"]);
exports.messageChannelSchema = zod_1.z.enum(["whatsapp", "voice"]);
exports.invoiceStatusSchema = zod_1.z.enum([
    "due_soon",
    "overdue",
    "paid",
    "in_collection"
]);
exports.carteraImportRowSchema = zod_1.z.object({
    documentId: zod_1.z.string().optional(),
    name: zod_1.z.string().min(1),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    invoiceExternalId: zod_1.z.string().optional(),
    amount: zod_1.z.coerce.number().positive(),
    currency: zod_1.z.string().default("COP"),
    dueDate: zod_1.z.coerce.date()
});
//# sourceMappingURL=index.js.map