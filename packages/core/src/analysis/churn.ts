import type { XeroSnapshot } from "../domain/types.js";
import {
  computeOrderCadence,
  indexCadenceByContact,
  type OrderCadence,
} from "./order-cadence.js";
import {
  computePaymentPatterns,
  indexByContact,
  type PaymentPattern,
} from "./payment-pattern.js";
import { clamp01, daysBetween, groupBy, logistic, round, saturate } from "./util.js";

export interface ChurnSignal {
  contactId: string;
  /** 0–1: combined likelihood this customer is churning. */
  score: number;
  band: "low" | "medium" | "high";
  decliningOrders: boolean;
  worseningPayment: boolean;
  lapsed: boolean;
  /** Orders in the recent window vs the prior window of equal length. */
  recentOrderCount: number;
  priorOrderCount: number;
  signals: string[];
}

const WINDOW_DAYS = 180; // recent vs prior comparison window
const W_RECENCY = 0.45;
const W_VOLUME = 0.35;
const W_PAYMENT = 0.2;

function windowedOrderCounts(
  snapshot: XeroSnapshot,
  contactId: string,
): { recent: number; prior: number } {
  let recent = 0;
  let prior = 0;
  for (const inv of snapshot.invoices) {
    if (inv.contactId !== contactId) continue;
    if (inv.status === "VOIDED" || inv.status === "DELETED" || inv.status === "DRAFT") continue;
    const age = daysBetween(inv.issueDate, snapshot.asOf);
    if (age < 0) continue;
    if (age <= WINDOW_DAYS) recent += 1;
    else if (age <= WINDOW_DAYS * 2) prior += 1;
  }
  return { recent, prior };
}

export function computeChurnSignals(
  snapshot: XeroSnapshot,
  precomputed?: { cadence?: OrderCadence[]; patterns?: PaymentPattern[] },
): ChurnSignal[] {
  const cadenceIndex = indexCadenceByContact(
    precomputed?.cadence ?? computeOrderCadence(snapshot),
  );
  const patternIndex = indexByContact(
    precomputed?.patterns ?? computePaymentPatterns(snapshot),
  );

  const contactIds = new Set<string>([
    ...groupBy(snapshot.invoices, (i) => i.contactId).keys(),
    ...snapshot.contacts.map((c) => c.contactId),
  ]);

  const results: ChurnSignal[] = [];
  for (const contactId of contactIds) {
    const cadence = cadenceIndex.get(contactId);
    const pattern = patternIndex.get(contactId);
    const { recent, prior } = windowedOrderCounts(snapshot, contactId);

    const lapsed = cadence
      ? cadence.segment === "lapsed" || cadence.segment === "dormant"
      : true;
    const decliningOrders = prior > 0 && recent < prior;
    const worseningPayment = pattern?.trend === "worsening";

    // Recency component: z-score the current silence against the customer's
    // OWN inter-order gap distribution, then squash through a logistic link.
    // z = 0 → ordered right on schedule; z = +2 → silence already in the top
    // ~2.5% of their historical gaps.
    let recencyComponent: number;
    if (cadence && cadence.frequencyDays > 0 && cadence.recencyDays !== Infinity) {
      const sigma = Math.max(cadence.gapStd, cadence.frequencyDays * 0.25, 7);
      const z = (cadence.recencyDays - cadence.frequencyDays) / sigma;
      recencyComponent = logistic(1.2 * z - 0.5);
    } else if (cadence && cadence.recencyDays !== Infinity) {
      // Single-order customers: no gap distribution — fall back to absolute age.
      recencyComponent = saturate(cadence.recencyDays, 180);
    } else {
      recencyComponent = 1;
    }

    // Volume component: proportional drop from prior to recent window.
    const volumeComponent = prior > 0 ? clamp01((prior - recent) / prior) : recent === 0 ? 0.5 : 0;

    // Payment component: worsening trend + how late they run.
    const paymentComponent = pattern
      ? clamp01(
          (worseningPayment ? 0.6 : 0.3) + saturate(Math.max(0, pattern.avgDaysLate), 30) * 0.4,
        )
      : 0.3;

    const score = clamp01(
      W_RECENCY * recencyComponent + W_VOLUME * volumeComponent + W_PAYMENT * paymentComponent,
    );

    const signals: string[] = [];
    if (lapsed) signals.push("no recent orders (lapsed)");
    if (decliningOrders) signals.push(`orders fell ${prior}→${recent} vs prior window`);
    if (worseningPayment) signals.push("payment behaviour worsening");
    if (signals.length === 0) signals.push("healthy");

    results.push({
      contactId,
      score: round(score, 3),
      band: score >= 0.66 ? "high" : score >= 0.33 ? "medium" : "low",
      decliningOrders,
      worseningPayment,
      lapsed,
      recentOrderCount: recent,
      priorOrderCount: prior,
      signals,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
