import type { Invoice, XeroSnapshot } from "../domain/types.js";
import { daysBetween, groupBy, mean, round, sortByDateAsc } from "./util.js";

export type CustomerSegment = "new" | "repeat" | "lapsed" | "dormant";

export interface OrderCadence {
  contactId: string;
  orderCount: number;
  /** Mean days between consecutive orders (0 if <2 orders). */
  frequencyDays: number;
  /** Days since the most recent order, relative to snapshot.asOf. */
  recencyDays: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  segment: CustomerSegment;
  /** True when recency has stretched well past this customer's own cadence. */
  overdueForReorder: boolean;
}

/** Invoices that represent real orders (exclude voided/deleted/draft). */
function orderInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.filter(
    (inv) => inv.status !== "VOIDED" && inv.status !== "DELETED" && inv.status !== "DRAFT",
  );
}

const ABSOLUTE_LAPSE_DAYS = 90; // floor for "lapsed" regardless of cadence
const DORMANT_MULTIPLIER = 2; // recency > 2× cadence ⇒ overdue for reorder

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
    const frequencyDays = gaps.length ? round(mean(gaps)) : 0;

    const lapseThreshold = frequencyDays
      ? Math.max(ABSOLUTE_LAPSE_DAYS, frequencyDays * DORMANT_MULTIPLIER)
      : ABSOLUTE_LAPSE_DAYS;
    const overdueForReorder = frequencyDays > 0 && recencyDays > frequencyDays * DORMANT_MULTIPLIER;

    let segment: CustomerSegment;
    if (recencyDays > lapseThreshold * 2) segment = "dormant";
    else if (recencyDays > lapseThreshold) segment = "lapsed";
    else if (orderCount === 1) segment = "new";
    else segment = "repeat";

    results.push({
      contactId,
      orderCount,
      frequencyDays,
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
