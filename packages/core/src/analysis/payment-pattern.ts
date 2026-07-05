import type { Invoice, Payment, XeroSnapshot } from "../domain/types.js";
import { daysBetween, groupBy, mean, olsSlope, round, sortByDateAsc, stddev } from "./util.js";

export type PaymentTrend = "improving" | "worsening" | "stable" | "unknown";

export interface PaymentPattern {
  contactId: string;
  /** Number of settled invoices the pattern is based on. */
  sampleSize: number;
  /** Mean days between due date and settlement (negative = pays early). */
  avgDaysLate: number;
  /** Population std-dev of lateness — how consistent the customer is. */
  stdDaysLate: number;
  /** avgDaysLate over the most recent half of settled invoices (display). */
  recentAvgDaysLate: number;
  /**
   * OLS regression slope of lateness over settlement order — days of added
   * lateness per invoice. Positive = each invoice settles later than the last.
   */
  slopePerInvoice: number;
  /** recentAvgDaysLate − olderAvgDaysLate (kept for display). */
  trendDelta: number;
  trend: PaymentTrend;
  /** 0–1 confidence in the pattern, grows with sample size. */
  reliability: number;
}

/** An invoice is "settled" once nothing is due and at least one payment exists. */
export function settlementDate(invoice: Invoice, payments: Payment[]): string | null {
  if (invoice.amountDue > 0.005) return null;
  const forInvoice = payments.filter((p) => p.invoiceId === invoice.invoiceId);
  if (forInvoice.length === 0) return null;
  // Settled on the date of the final payment that cleared it.
  return sortByDateAsc(forInvoice, (p) => p.date).at(-1)!.date;
}

/** Trend fires when the fitted slope implies ≥3 days drift per invoice. */
const TREND_SLOPE_THRESHOLD = 3;

export function computePaymentPatterns(snapshot: XeroSnapshot): PaymentPattern[] {
  const paymentsByInvoice = snapshot.payments;
  const byContact = groupBy(snapshot.invoices, (inv) => inv.contactId);

  const results: PaymentPattern[] = [];
  for (const [contactId, invoices] of byContact) {
    const settled = sortByDateAsc(
      invoices
        .map((inv) => ({ inv, settledOn: settlementDate(inv, paymentsByInvoice) }))
        .filter((x): x is { inv: Invoice; settledOn: string } => x.settledOn !== null),
      (x) => x.settledOn,
    );

    if (settled.length === 0) {
      results.push({
        contactId,
        sampleSize: 0,
        avgDaysLate: 0,
        stdDaysLate: 0,
        recentAvgDaysLate: 0,
        slopePerInvoice: 0,
        trendDelta: 0,
        trend: "unknown",
        reliability: 0,
      });
      continue;
    }

    const latenesses = settled.map((x) => daysBetween(x.inv.dueDate, x.settledOn));
    const avgDaysLate = mean(latenesses);
    const stdDaysLate = stddev(latenesses);

    // Trend: OLS regression of lateness over settlement order. A fitted slope
    // is robust to where the series is split, unlike a half-vs-half compare.
    const slope = olsSlope(latenesses.map((y, i) => ({ x: i, y })));

    // Half-split averages retained for human-readable display.
    const mid = Math.floor(latenesses.length / 2);
    const older = latenesses.slice(0, mid);
    const recent = latenesses.slice(mid);
    const recentAvg = mean(recent);
    const olderAvg = older.length ? mean(older) : recentAvg;

    let trend: PaymentTrend = "stable";
    if (settled.length < 3) trend = settled.length < 2 ? "unknown" : "stable";
    else if (slope > TREND_SLOPE_THRESHOLD) trend = "worsening";
    else if (slope < -TREND_SLOPE_THRESHOLD) trend = "improving";

    results.push({
      contactId,
      sampleSize: settled.length,
      avgDaysLate: round(avgDaysLate),
      stdDaysLate: round(stdDaysLate),
      recentAvgDaysLate: round(recentAvg),
      slopePerInvoice: round(slope, 2),
      trendDelta: round(recentAvg - olderAvg),
      trend,
      // Reliability saturates: ~5 invoices → 0.83, 10+ → ~0.9+.
      reliability: round(settled.length / (settled.length + 1)),
    });
  }

  return results;
}

export function indexByContact(patterns: PaymentPattern[]): Map<string, PaymentPattern> {
  return new Map(patterns.map((p) => [p.contactId, p]));
}
