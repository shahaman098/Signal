import type { ISODate, XeroSnapshot } from "../domain/types.js";
import type { ReceivablesReport } from "./report.js";
import { settlementDate } from "./payment-pattern.js";
import { daysBetween, round, sortByDateAsc } from "./util.js";

/**
 * Chart-ready per-contact series for the Plan stage: the visual "chain of
 * inputs" behind a proposal. Shapes are deliberately tiny-SVG-friendly —
 * chronological points, a render hint, an optional zero baseline — so the
 * frontend needs no chart library.
 */

export interface SeriesPoint {
  date: ISODate;
  value: number;
  label?: string; // e.g. invoice number
}

export interface MetricSeries {
  id: "payment-lateness" | "order-values";
  title: string;
  unit: "days" | "currency";
  kind: "bar" | "line";
  /** Draw a reference line at this value (0 → lateness can be negative = early). */
  baseline?: number;
  points: SeriesPoint[];
}

export interface KeyMetric {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}

const MAX_POINTS = 24;

export function buildContactSeries(snapshot: XeroSnapshot, contactId: string): MetricSeries[] {
  const series: MetricSeries[] = [];
  const invoices = snapshot.invoices.filter((i) => i.contactId === contactId);

  // Payment lateness: one point per settled invoice (x = settlement date,
  // y = days after due; negative = paid early).
  const lateness: SeriesPoint[] = [];
  for (const inv of invoices) {
    const settledOn = settlementDate(inv, snapshot.payments);
    if (!settledOn) continue;
    lateness.push({
      date: settledOn,
      value: daysBetween(inv.dueDate, settledOn),
      label: inv.invoiceNumber ?? inv.invoiceId,
    });
  }
  if (lateness.length > 0) {
    series.push({
      id: "payment-lateness",
      title: "Days late per settled invoice",
      unit: "days",
      kind: "bar",
      baseline: 0,
      points: sortByDateAsc(lateness, (p) => p.date).slice(-MAX_POINTS),
    });
  }

  // Order values: one point per real order (excludes drafts/voided).
  const orders: SeriesPoint[] = invoices
    .filter((i) => i.status !== "VOIDED" && i.status !== "DELETED" && i.status !== "DRAFT")
    .map((i) => ({ date: i.issueDate, value: round(i.total), label: i.invoiceNumber ?? i.invoiceId }));
  if (orders.length > 0) {
    series.push({
      id: "order-values",
      title: "Order value per invoice",
      unit: "currency",
      kind: "line",
      points: sortByDateAsc(orders, (p) => p.date).slice(-MAX_POINTS),
    });
  }

  return series;
}

export function buildContactMetrics(report: ReceivablesReport, contactId: string): KeyMetric[] {
  const metrics: KeyMetric[] = [];
  const pattern = report.paymentPatterns.find((p) => p.contactId === contactId);
  const cadence = report.orderCadence.find((c) => c.contactId === contactId);
  const churn = report.churn.find((c) => c.contactId === contactId);
  const outstanding = report.slipRisk
    .filter((r) => r.contactId === contactId)
    .reduce((s, r) => s + r.amountDue, 0);

  if (pattern && pattern.sampleSize > 0) {
    metrics.push({
      label: "Avg days late",
      value: `${pattern.avgDaysLate}d (${pattern.trend})`,
      tone: pattern.trend === "worsening" ? "bad" : pattern.avgDaysLate <= 0 ? "good" : "neutral",
    });
  }
  if (cadence && cadence.orderCount > 0) {
    metrics.push({
      label: "Order cadence",
      value: cadence.frequencyDays ? `every ~${Math.round(cadence.frequencyDays)}d · ${cadence.segment}` : cadence.segment,
      tone: cadence.segment === "repeat" ? "good" : cadence.segment === "new" ? "neutral" : "bad",
    });
    metrics.push({
      label: "Last order",
      value: `${cadence.recencyDays}d ago`,
      tone: cadence.overdueForReorder ? "bad" : "neutral",
    });
  }
  if (churn) {
    metrics.push({
      label: "Churn score",
      value: churn.score.toFixed(2),
      tone: churn.band === "high" ? "bad" : churn.band === "low" ? "good" : "neutral",
    });
  }
  if (outstanding > 0) {
    metrics.push({ label: "Overdue balance", value: String(round(outstanding)), tone: "bad" });
  }
  return metrics;
}
