import { round } from "@signal/core";
import type { AnalyticsService } from "./analytics.service.js";
import type { ProposalStore } from "./proposal-store.js";

/**
 * Measure — the "revenue & cash unlocked" ledger. Every number here traces to
 * an executed action and, where possible, to a REAL movement in Xero:
 *
 *  - cashRecovered: for executed chase emails we stored the invoice balance at
 *    execution time; recovery = how much that balance has actually dropped
 *    since (read back from the live snapshot — not an estimate).
 *  - pipelineCreated: value of quotes/draft invoices actually created in Xero.
 *  - savingsCaptured: early-payment discounts acted on.
 */
export interface ImpactSummary {
  actionsExecuted: number;
  emailsDrafted: number;
  quotesCreated: number;
  /** Realised: balance reduction on chased invoices since the chase ran. */
  cashRecovered: number;
  /** Value of quotes/drafts written to Xero (pipeline, not yet cash). */
  pipelineCreated: number;
  /** Early-payment savings acted on. */
  savingsCaptured: number;
  /** cashRecovered + pipelineCreated + savingsCaptured. */
  totalUnlocked: number;
  /** The money pipeline: found (awaiting approval) → in motion (actions running) → landed (real). */
  stages: {
    /** Σ impact of pending proposals — money sitting in the data. */
    found: number;
    /** Chased balances still outstanding + quotes awaiting acceptance. */
    inMotion: number;
    /** Cash actually recovered + savings captured. */
    landed: number;
  };
}

export class ImpactService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly store: ProposalStore,
  ) {}

  async summary(): Promise<ImpactSummary> {
    const [proposals, snapshot] = await Promise.all([
      this.store.loadAll(),
      this.analytics.getSnapshot(),
    ]);
    const executed = proposals.filter((p) => p.status === "executed");
    const invoiceDue = new Map(snapshot.invoices.map((i) => [i.invoiceId, i.amountDue]));

    let cashRecovered = 0;
    let pipelineCreated = 0;
    let savingsCaptured = 0;
    let emailsDrafted = 0;
    let quotesCreated = 0;
    let chasingStill = 0; // chased balances not yet paid — money "in motion"

    for (const p of executed) {
      switch (p.action.kind) {
        case "chase-email": {
          emailsDrafted += 1;
          const atExecution = p.result?.amountDueAtExecution;
          const nowDue = p.invoiceId ? invoiceDue.get(p.invoiceId) : undefined;
          if (atExecution !== undefined && nowDue !== undefined) {
            if (nowDue < atExecution) cashRecovered += atExecution - nowDue; // real movement in Xero
            chasingStill += Math.min(nowDue, atExecution);
          }
          break;
        }
        case "create-quote":
        case "convert-recurring": {
          if (p.result?.xeroId) {
            quotesCreated += 1;
            const value = p.prepared?.lineItems.reduce((s, li) => s + li.lineAmount, 0) ?? p.impact ?? 0;
            pipelineCreated += value;
          }
          break;
        }
        case "pay-bill-early":
          savingsCaptured += p.action.saving;
          break;
        default:
          break;
      }
    }

    const found = proposals
      .filter((p) => p.status === "proposed")
      .reduce((s, p) => s + (p.impact ?? 0), 0);

    return {
      actionsExecuted: executed.length,
      emailsDrafted,
      quotesCreated,
      cashRecovered: round(cashRecovered),
      pipelineCreated: round(pipelineCreated),
      savingsCaptured: round(savingsCaptured),
      totalUnlocked: round(cashRecovered + pipelineCreated + savingsCaptured),
      stages: {
        found: round(found),
        inMotion: round(chasingStill + pipelineCreated),
        landed: round(cashRecovered + savingsCaptured),
      },
    };
  }
}
