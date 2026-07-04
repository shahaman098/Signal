import {
  type CreateInvoiceDraftInput,
  type CreatePaymentInput,
  type CreateQuoteInput,
  type LineItem,
  type ReceivablesReport,
  type XeroPort,
} from "@signal/core";
import type { AnalyticsService } from "./analytics.service.js";
import { ChaseEmailDrafter, type ChaseEmailDraft } from "../llm/chase-email.js";

/**
 * The write side. Turns analysis output into concrete Xero actions:
 *   - reactivation quotes for lapsed / churn-risk customers (the flagship)
 *   - draft invoices (never auto-authorised)
 *   - payments against invoices
 *   - chase emails (drafted, returned to caller — NOT written to Xero)
 */
export class ActionsService {
  constructor(
    private readonly xero: XeroPort,
    private readonly analytics: AnalyticsService,
    private readonly emailDrafter: ChaseEmailDrafter,
  ) {}

  async createQuote(input: CreateQuoteInput) {
    const result = await this.xero.createQuote(input);
    this.analytics.invalidate();
    return result;
  }

  async createInvoiceDraft(input: CreateInvoiceDraftInput) {
    const result = await this.xero.createInvoiceDraft(input);
    this.analytics.invalidate();
    return result;
  }

  async createPayment(input: CreatePaymentInput) {
    const result = await this.xero.createPayment(input);
    this.analytics.invalidate();
    return result;
  }

  /**
   * Flagship: propose reactivation-offer quotes for the highest churn-risk
   * customers, based on what they used to order. Returns *proposals* — the
   * caller decides which to actually push to Xero via createQuote.
   */
  async proposeReactivationQuotes(limit = 5): Promise<ReactivationProposal[]> {
    const snapshot = await this.analytics.getSnapshot();
    const report = await this.analytics.getReport();
    const churnByRisk = [...report.churn].filter((c) => c.band !== "low");

    const proposals: ReactivationProposal[] = [];
    for (const churn of churnByRisk.slice(0, limit)) {
      const contact = snapshot.contacts.find((c) => c.contactId === churn.contactId);
      if (!contact) continue;

      // Base the offer on their most recent real order's line items.
      const pastOrders = snapshot.invoices
        .filter((i) => i.contactId === churn.contactId && i.lineItems.length > 0)
        .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
      const template = pastOrders[0];
      if (!template) continue;

      const lineItems: LineItem[] = template.lineItems.map((li) => ({
        ...li,
        description: `${li.description} (welcome-back offer)`,
      }));

      proposals.push({
        contactId: contact.contactId,
        contactName: contact.name,
        churnScore: churn.score,
        rationale: churn.signals,
        quote: {
          contactId: contact.contactId,
          reference: "Reactivation offer",
          summary: `We'd love to have ${contact.name} back — here's a tailored offer.`,
          lineItems,
        },
      });
    }
    return proposals;
  }

  async draftChaseEmail(invoiceId: string, opts?: { tone?: "friendly" | "firm" }): Promise<ChaseEmailDraft> {
    const invoice = await this.analytics.findInvoice(invoiceId);
    if (!invoice) throw new NotFoundError(`Invoice ${invoiceId} not found`);
    const contact = await this.analytics.findContact(invoice.contactId);
    if (!contact) throw new NotFoundError(`Contact ${invoice.contactId} not found`);

    const report = await this.analytics.getReport();
    const slipRisk = report.slipRisk.find((r) => r.invoiceId === invoiceId);

    return this.emailDrafter.draft({ contact, invoice, slipRisk, tone: opts?.tone });
  }
}

export interface ReactivationProposal {
  contactId: string;
  contactName: string;
  churnScore: number;
  rationale: string[];
  quote: CreateQuoteInput;
}

export class NotFoundError extends Error {}

/** Narrow helper so the report type is exported for route typing. */
export type { ReceivablesReport };
