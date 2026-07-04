import type { Invoice, XeroSnapshot } from "../domain/types.js";
import { computePaymentPatterns, indexByContact, type PaymentPattern } from "./payment-pattern.js";
import { clamp01, daysBetween, round, saturate } from "./util.js";

export interface SlipRisk {
  invoiceId: string;
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

// Weights sum to 1. Tuned so a chronically-late customer with a long-overdue,
// worsening-trend invoice lands in the "high" band.
const W_DAYS = 0.4;
const W_HABIT = 0.35;
const W_TREND = 0.25;
const DAYS_CAP = 90; // ≥90 days overdue saturates the recency component
const HABIT_CAP = 30; // avg 30+ days late saturates the habit component

export function computeSlipRisk(
  snapshot: XeroSnapshot,
  patterns?: PaymentPattern[],
): SlipRisk[] {
  const patternIndex = indexByContact(patterns ?? computePaymentPatterns(snapshot));
  const results: SlipRisk[] = [];

  for (const invoice of snapshot.invoices) {
    if (!isOverdue(invoice, snapshot.asOf)) continue;

    const daysOverdue = daysBetween(invoice.dueDate, snapshot.asOf);
    const pattern = patternIndex.get(invoice.contactId);

    const daysComponent = saturate(daysOverdue, DAYS_CAP);
    const habitComponent = pattern ? saturate(Math.max(0, pattern.avgDaysLate), HABIT_CAP) : 0.5;
    const trendComponent = pattern
      ? clamp01(0.5 + pattern.trendDelta / (2 * HABIT_CAP))
      : 0.5;

    // Down-weight the behavioural terms when we have little history on the customer.
    const confidence = pattern ? pattern.reliability : 0;
    const behaviouralBlend = confidence;
    const score = clamp01(
      W_DAYS * daysComponent +
        W_HABIT * (behaviouralBlend * habitComponent + (1 - behaviouralBlend) * 0.5) +
        W_TREND * (behaviouralBlend * trendComponent + (1 - behaviouralBlend) * 0.5),
    );

    const reasons: string[] = [];
    reasons.push(`${daysOverdue} days overdue`);
    if (pattern && pattern.sampleSize > 0) {
      reasons.push(`pays ~${pattern.avgDaysLate}d after due on average`);
      if (pattern.trend === "worsening") reasons.push("payment behaviour worsening");
      if (pattern.trend === "improving") reasons.push("payment behaviour improving");
    } else {
      reasons.push("no payment history for this customer");
    }

    results.push({
      invoiceId: invoice.invoiceId,
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
