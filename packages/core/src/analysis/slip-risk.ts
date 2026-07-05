import type { Invoice, XeroSnapshot } from "../domain/types.js";
import { computePaymentPatterns, indexByContact, type PaymentPattern } from "./payment-pattern.js";
import { clamp01, daysBetween, logistic, mean, round, shrink, stddev } from "./util.js";

export interface SlipRisk {
  invoiceId: string;
  /** Human-readable reference (INV-0042) — prefer over the GUID in UIs. */
  invoiceNumber?: string;
  contactId: string;
  amountDue: number;
  daysOverdue: number;
  /** 0–1: likelihood this invoice slips further / isn't paid soon. */
  score: number;
  band: "low" | "medium" | "high";
  reasons: string[];
}

/** An overdue invoice is authorised/submitted, still owing, and past due. */
export function isOverdue(invoice: Invoice, asOf: string): boolean {
  const collectible = invoice.status === "AUTHORISED" || invoice.status === "SUBMITTED";
  return collectible && invoice.amountDue > 0.005 && daysBetween(invoice.dueDate, asOf) > 0;
}

/**
 * Slip-risk model.
 *
 * The question: "how far outside this customer's own payment behaviour is
 * this invoice, and is that behaviour deteriorating?" — an invoice 20 days
 * overdue is routine for a customer who always pays ~25 days late, and a
 * red flag for one who always pays on time.
 *
 *   1. Estimate the customer's lateness distribution (μ, σ) from their
 *      settled invoices, SHRUNK toward the portfolio-wide distribution with
 *      empirical-Bayes weighting (prior strength K_PRIOR) — so a customer
 *      with 2 data points mostly inherits the book's behaviour, one with 20
 *      speaks for themselves.
 *   2. z-score the invoice's days-overdue against that distribution: how
 *      many σ beyond their normal settling point is this balance?
 *   3. Add the payment-trend term (OLS slope of lateness per invoice).
 *   4. Squash through a logistic link into (0, 1).
 *
 *   risk = σ( W_Z·z + W_SLOPE·(slope/10) + BIAS )
 */
const K_PRIOR = 3; // prior strength: worth 3 observations
const SIGMA_FLOOR = 3; // days — protects z from near-zero variance customers
const W_Z = 0.9;
const W_SLOPE = 0.6;
const BIAS = -0.6; // sets risk ≈ 0.35 for a perfectly in-pattern invoice
const FALLBACK_PRIOR_MEAN = 7; // used only when the whole book has no history
const FALLBACK_PRIOR_STD = 10;

export function computeSlipRisk(
  snapshot: XeroSnapshot,
  patterns?: PaymentPattern[],
): SlipRisk[] {
  const allPatterns = patterns ?? computePaymentPatterns(snapshot);
  const patternIndex = indexByContact(allPatterns);

  // Portfolio prior: the lateness distribution across every settled invoice
  // in the book (weighted by per-contact means; robust enough at this scale).
  const settled = allPatterns.filter((p) => p.sampleSize > 0);
  const priorMean = settled.length ? mean(settled.map((p) => p.avgDaysLate)) : FALLBACK_PRIOR_MEAN;
  const priorStd = settled.length
    ? Math.max(stddev(settled.map((p) => p.avgDaysLate)), FALLBACK_PRIOR_STD)
    : FALLBACK_PRIOR_STD;

  const results: SlipRisk[] = [];

  for (const invoice of snapshot.invoices) {
    if (!isOverdue(invoice, snapshot.asOf)) continue;

    const daysOverdue = daysBetween(invoice.dueDate, snapshot.asOf);
    const pattern = patternIndex.get(invoice.contactId);
    const n = pattern?.sampleSize ?? 0;

    // Empirical-Bayes posterior for this customer's lateness distribution.
    const mu = shrink(pattern?.avgDaysLate ?? 0, n, priorMean, K_PRIOR);
    const sigma = Math.max(
      shrink(pattern?.stdDaysLate ?? 0, n, priorStd, K_PRIOR),
      SIGMA_FLOOR,
    );

    const z = (daysOverdue - mu) / sigma;
    const slope = pattern?.slopePerInvoice ?? 0;
    const score = clamp01(logistic(W_Z * z + W_SLOPE * (slope / 10) + BIAS));

    const reasons: string[] = [
      `${daysOverdue} days overdue — ${round(z, 1)}σ beyond their typical settling point (~${round(mu)}d ±${round(sigma)}d)`,
    ];
    if (n > 0) {
      reasons.push(`based on ${n} settled invoice${n === 1 ? "" : "s"} (avg ${pattern!.avgDaysLate}d late)`);
      if (pattern!.trend === "worsening") {
        reasons.push(`payment behaviour worsening (+${pattern!.slopePerInvoice}d per invoice)`);
      }
      if (pattern!.trend === "improving") reasons.push("payment behaviour improving");
    } else {
      reasons.push("no settled history — using the portfolio-wide payment distribution");
    }

    results.push({
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      contactId: invoice.contactId,
      amountDue: round(invoice.amountDue),
      daysOverdue,
      score: round(score, 3),
      band: score >= 0.66 ? "high" : score >= 0.33 ? "medium" : "low",
      reasons,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
