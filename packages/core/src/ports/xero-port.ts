import type {
  AgedReceivable,
  BankTransaction,
  Contact,
  Invoice,
  Payment,
  ProfitAndLossRow,
  XeroSnapshot,
} from "../domain/types.js";
import type {
  CreateInvoiceDraftInput,
  CreatePaymentInput,
  CreateQuoteInput,
} from "../domain/schemas.js";

/**
 * The port (in the hexagonal-architecture sense) through which the application
 * talks to Xero. Concrete adapters live in apps/api/src/adapters:
 *   - XeroMcpAdapter   → real Xero over the Model Context Protocol
 *   - FakeXeroAdapter  → deterministic in-memory data for dev + tests
 *
 * Keeping this interface here (in framework-free core) means services and the
 * analysis layer depend on the abstraction, never on Xero or MCP directly.
 */
export interface XeroPort {
  // ---- Reads ----
  listContacts(): Promise<Contact[]>;
  listInvoices(opts?: { modifiedSince?: string }): Promise<Invoice[]>;
  listPayments(): Promise<Payment[]>;
  getAgedReceivables(): Promise<AgedReceivable[]>;

  // Optional money-out reads. Adapters that can't serve these return [].
  listBankTransactions?(): Promise<BankTransaction[]>;
  getProfitAndLoss?(): Promise<ProfitAndLossRow[]>;

  /**
   * Convenience aggregate: pull everything the analysis layer needs in one call.
   * Default adapters implement this by fanning out to the individual reads.
   */
  snapshot(): Promise<XeroSnapshot>;

  // ---- Writes ----
  /** Flagship: reactivation / recurring-conversion offer. */
  createQuote(input: CreateQuoteInput): Promise<{ quoteId: string }>;
  /** Draft only — never auto-authorised. */
  createInvoiceDraft(input: CreateInvoiceDraftInput): Promise<{ invoiceId: string }>;
  createPayment(input: CreatePaymentInput): Promise<{ paymentId: string }>;
}
