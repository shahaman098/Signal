/**
 * Domain model — a normalised, Xero-agnostic view of the accounting data we read.
 *
 * These types are deliberately decoupled from Xero's wire format. Adapters
 * (see ../ports/xero-port.ts) are responsible for mapping Xero's payloads into
 * these shapes so the analysis layer never depends on Xero specifics.
 */

export type ISODate = string; // "2026-07-04" or full ISO timestamp

export type InvoiceStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "AUTHORISED" // approved, awaiting/receiving payment
  | "PAID"
  | "VOIDED"
  | "DELETED";

export interface LineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  accountCode?: string;
  itemCode?: string;
}

export interface Contact {
  contactId: string;
  name: string;
  email?: string;
}

export interface Invoice {
  invoiceId: string;
  invoiceNumber?: string;
  contactId: string;
  status: InvoiceStatus;
  issueDate: ISODate;
  dueDate: ISODate;
  total: number;
  amountDue: number;
  amountPaid: number;
  currencyCode?: string;
  lineItems: LineItem[];
}

export interface Payment {
  paymentId: string;
  invoiceId: string;
  date: ISODate;
  amount: number;
}

/** A single bracket in Xero's aged-receivables report, per contact. */
export interface AgedReceivable {
  contactId: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  older: number;
  total: number;
}

/** Optional money-out signals (feature-flagged reads). */
export interface BankTransaction {
  bankTransactionId: string;
  date: ISODate;
  type: "SPEND" | "RECEIVE";
  amount: number;
  contactId?: string;
  reference?: string;
}

export interface ProfitAndLossRow {
  account: string;
  amount: number;
  section: "revenue" | "expense" | "other";
}

/**
 * A dataset snapshot pulled from Xero for a given tenant, passed as the sole
 * input to the analysis layer. Everything the derivations need lives here so
 * they stay pure and trivially testable.
 */
export interface XeroSnapshot {
  asOf: ISODate;
  contacts: Contact[];
  invoices: Invoice[];
  payments: Payment[];
  agedReceivables: AgedReceivable[];
  bankTransactions?: BankTransaction[];
  profitAndLoss?: ProfitAndLossRow[];
}
