import {
  makeEnrichedDemoSnapshot,
  type AgedReceivable,
  type Contact,
  type CreateInvoiceDraftInput,
  type CreatePaymentInput,
  type CreateQuoteInput,
  type Invoice,
  type Payment,
  type XeroPort,
  type XeroSnapshot,
} from "@signal/core";

/**
 * In-memory XeroPort backed by the deterministic demo snapshot. Used for local
 * development (XERO_ADAPTER=fake) and by the API integration tests, so the whole
 * HTTP surface can be exercised with zero external dependencies. Writes are
 * recorded so tests can assert on them.
 */
export class FakeXeroAdapter implements XeroPort {
  private snapshotData: XeroSnapshot;
  readonly created = {
    quotes: [] as CreateQuoteInput[],
    invoiceDrafts: [] as CreateInvoiceDraftInput[],
    payments: [] as CreatePaymentInput[],
  };
  private counter = 0;

  constructor(snapshot: XeroSnapshot = makeEnrichedDemoSnapshot()) {
    this.snapshotData = snapshot;
  }

  async listContacts(): Promise<Contact[]> {
    return this.snapshotData.contacts;
  }

  async listInvoices(): Promise<Invoice[]> {
    return this.snapshotData.invoices;
  }

  async listPayments(): Promise<Payment[]> {
    return this.snapshotData.payments;
  }

  async getAgedReceivables(): Promise<AgedReceivable[]> {
    return this.snapshotData.agedReceivables;
  }

  async snapshot(): Promise<XeroSnapshot> {
    return this.snapshotData;
  }

  async createQuote(input: CreateQuoteInput): Promise<{ quoteId: string; deepLink?: string }> {
    this.created.quotes.push(input);
    const quoteId = `quote-${++this.counter}`;
    return { quoteId, deepLink: `https://go.xero.com/app/quotes/${quoteId}` };
  }

  async createInvoiceDraft(
    input: CreateInvoiceDraftInput,
  ): Promise<{ invoiceId: string; deepLink?: string }> {
    this.created.invoiceDrafts.push(input);
    const invoiceId = `draft-${++this.counter}`;
    return { invoiceId, deepLink: `https://go.xero.com/app/invoices/${invoiceId}` };
  }

  async createPayment(input: CreatePaymentInput): Promise<{ paymentId: string; deepLink?: string }> {
    this.created.payments.push(input);
    return { paymentId: `payment-${++this.counter}` };
  }
}
