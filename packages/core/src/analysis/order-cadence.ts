import type { Invoice, XeroSnapshot } from "../domain/types.js";
import { daysBetween, groupBy, mean, median, round, sortByDateAsc, stddev } from "./util.js";

export type CustomerSegment = "new" | "repeat" | "lapsed" | "dormant";

export interface OrderCadence {
  contactId: string;
  orderCount: number;
  /** Median days between consecutive orders (0 if <2 orders) — robust to outliers. */
  frequencyDays: number;
  /** Std-dev of inter-order gaps — how regular the cadence is. */
  gapStd: number;
  /** Days since the most recent order, relative to snapshot.asOf. */
  recencyDays: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  segment: CustomerSegment;
  /** True when recency has stretched beyond μ+2σ of their own gap distribution. */
  overdueForReorder: boolean;
}

/** Invoices that represent real orders (exclude voided/deleted/draft). */
function orderInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.filter(
    (inv) => inv.status !== "VOIDED" && inv.status !== "DELETED" && inv.status !== "DRAFT",
  );
}

const ABSOLUTE_LAPSE_DAYS = 90; // floor for "lapsed" regardless of cadence

export function computeOrderCadence(snapshot: XeroSnapshot): OrderCadence[] {
  const byContact = groupBy(snapshot.invoices, (inv) => inv.contactId);
  const results: OrderCadence[] = [];

  for (const [contactId, all] of byContact) {
    const orders = sortByDateAsc(orderInvoices(all), (inv) => inv.issueDate);
    const orderCount = orders.length;

    if (orderCount === 0) {
      results.push({
        contactId,
        orderCount: 0,
        frequencyDays: 0,
        gapStd: 0,
        recencyDays: Infinity,
        firstOrderDate: null,
        lastOrderDate: null,
        segment: "dormant",
        overdueForReorder: false,
      });
      continue;
    }

    const firstOrderDate = orders[0]!.issueDate;
    const lastOrderDate = orders.at(-1)!.issueDate;
    const recencyDays = daysBetween(lastOrderDate, snapshot.asOf);

    const gaps: number[] = [];
    for (let i = 1; i < orders.length; i++) {
      gaps.push(daysBetween(orders[i - 1]!.issueDate, orders[i]!.issueDate));
    }
    // Median beats mean here: one long holiday gap shouldn't redefine cadence.
    const frequencyDays = gaps.length ? round(median(gaps)) : 0;
    const gapStd = gaps.length ? round(stddev(gaps)) : 0;

    // Statistical lapse point: a customer is "late to reorder" once recency
    // exceeds μ+2σ of their own gap distribution — i.e. the current silence
    // would sit in the top ~2.5% of their historical gaps. Floored at the
    // absolute threshold so sparse data can't produce a hair-trigger.
    const gapMean = gaps.length ? mean(gaps) : 0;
    const statisticalLapse = gaps.length ? gapMean + 2 * Math.max(gapStd, gapMean * 0.25) : 0;
    const lapseThreshold = Math.max(ABSOLUTE_LAPSE_DAYS, statisticalLapse);
    const overdueForReorder = gaps.length > 0 && recencyDays > statisticalLapse;

    let segment: CustomerSegment;
    if (recencyDays > lapseThreshold * 2) segment = "dormant";
    else if (recencyDays > lapseThreshold) segment = "lapsed";
    else if (orderCount === 1) segment = "new";
    else segment = "repeat";

    results.push({
      contactId,
      orderCount,
      frequencyDays,
      gapStd,
      recencyDays,
      firstOrderDate,
      lastOrderDate,
      segment,
      overdueForReorder,
    });
  }

  return results;
}

export function indexCadenceByContact(rows: OrderCadence[]): Map<string, OrderCadence> {
  return new Map(rows.map((r) => [r.contactId, r]));
}
