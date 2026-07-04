import { z } from "zod";

/**
 * Zod schemas mirroring domain/types.ts. Adapters validate raw Xero/MCP output
 * through these before it ever reaches the analysis layer, so a shape change on
 * Xero's side fails loudly at the boundary instead of corrupting derivations.
 */

export const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitAmount: z.number(),
  lineAmount: z.number(),
  accountCode: z.string().optional(),
  itemCode: z.string().optional(),
});

export const contactSchema = z.object({
  contactId: z.string().min(1),
  name: z.string(),
  email: z.string().email().optional(),
});

export const invoiceStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "AUTHORISED",
  "PAID",
  "VOIDED",
  "DELETED",
]);

export const invoiceSchema = z.object({
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().optional(),
  contactId: z.string().min(1),
  status: invoiceStatusSchema,
  issueDate: z.string(),
  dueDate: z.string(),
  total: z.number(),
  amountDue: z.number(),
  amountPaid: z.number(),
  currencyCode: z.string().optional(),
  lineItems: z.array(lineItemSchema),
});

export const paymentSchema = z.object({
  paymentId: z.string().min(1),
  invoiceId: z.string().min(1),
  date: z.string(),
  amount: z.number(),
});

export const agedReceivableSchema = z.object({
  contactId: z.string().min(1),
  current: z.number(),
  days1to30: z.number(),
  days31to60: z.number(),
  days61to90: z.number(),
  older: z.number(),
  total: z.number(),
});

export const bankTransactionSchema = z.object({
  bankTransactionId: z.string().min(1),
  date: z.string(),
  type: z.enum(["SPEND", "RECEIVE"]),
  amount: z.number(),
  contactId: z.string().optional(),
  reference: z.string().optional(),
});

export const profitAndLossRowSchema = z.object({
  account: z.string(),
  amount: z.number(),
  section: z.enum(["revenue", "expense", "other"]),
});

export const xeroSnapshotSchema = z.object({
  asOf: z.string(),
  contacts: z.array(contactSchema),
  invoices: z.array(invoiceSchema),
  payments: z.array(paymentSchema),
  agedReceivables: z.array(agedReceivableSchema),
  bankTransactions: z.array(bankTransactionSchema).optional(),
  profitAndLoss: z.array(profitAndLossRowSchema).optional(),
});

// ---- Write-side payloads ----

export const createQuoteInputSchema = z.object({
  contactId: z.string().min(1),
  reference: z.string().optional(),
  summary: z.string().optional(),
  expiryDate: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

export const createInvoiceDraftInputSchema = z.object({
  contactId: z.string().min(1),
  reference: z.string().optional(),
  dueDate: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

export const createPaymentInputSchema = z.object({
  invoiceId: z.string().min(1),
  accountId: z.string().min(1),
  date: z.string(),
  amount: z.number().positive(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteInputSchema>;
export type CreateInvoiceDraftInput = z.infer<typeof createInvoiceDraftInputSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentInputSchema>;
