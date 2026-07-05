import { indexCadenceByContact } from "../analysis/order-cadence.js";
import { indexByContact } from "../analysis/payment-pattern.js";
import { daysBetween, groupBy, mean, round, sortByDateAsc } from "../analysis/util.js";
import type { Signal, SignalInputs } from "./types.js";

/**
 * Strategic / portfolio signals.
 *
 * 14. concentration-risk → "62% of revenue in 3 clients"
 * 15. margin-drift       → a line's margin quietly dropping over months
 * 16. churn-cohort-match → behaving like customers shortly before they churned
 */
export function strategicSignals(inputs: SignalInputs): Signal[] {
  const { snapshot, report } = inputs;
  const signals: Signal[] = [];
  const contactName = new Map(snapshot.contacts.map((c) => [c.contactId, c.name]));

  const realOrders = snapshot.invoices.filter(
    (i) => i.status !== "VOIDED" && i.status !== "DELETED" && i.status !== "DRAFT",
  );

  // 14 — Customer concentration.
  const revenue = new Map<string, number>();
  for (const inv of realOrders) revenue.set(inv.contactId, (revenue.get(inv.contactId) ?? 0) + inv.total);
  const total = [...revenue.values()].reduce((s, v) => s + v, 0);
  if (total > 0) {
    const top3 = [...revenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const share = top3.reduce((s, [, v]) => s + v, 0) / total;
    if (share > 0.5 && revenue.size > 3) {
      signals.push({
        id: `concentration-risk:top3`,
        category: "strategic",
        type: "concentration-risk",
        severity: share > 0.7 ? "high" : "medium",
        score: round(share, 3),
        title: `${round(share * 100)}% of revenue sits with 3 clients`,
        reasoning: [
          `Top 3: ${top3.map(([cid, v]) => `${contactName.get(cid) ?? cid} (${round((v / total) * 100)}%)`).join(", ")}`,
          "Losing any one of them would materially dent revenue — diversify pipeline",
        ],
        evidence: top3.map(([cid, v]) => ({ label: `${contactName.get(cid) ?? cid}: ${round(v)}` })),
        recommendedAction: {
          kind: "flag-review",
          note: "Customer concentration above 50% — prioritise new-business development",
        },
      });
    }
  }

  // 15 — Margin drift: per item code, monthly margin% trend over ≥4 months.
  interface MarginPoint { month: string; margin: number }
  const byItem = new Map<string, MarginPoint[]>();
  for (const inv of realOrders) {
    const month = inv.issueDate.slice(0, 7);
    for (const li of inv.lineItems) {
      if (li.itemCode === undefined || li.unitCost === undefined || li.unitAmount <= 0) continue;
      const margin = (li.unitAmount - li.unitCost) / li.unitAmount;
      let arr = byItem.get(li.itemCode);
      if (!arr) byItem.set(li.itemCode, (arr = []));
      arr.push({ month, margin });
    }
  }
  // Monthly revenue per item — turns margin drift (%) into money leaked (£/mo).
  const monthlyItemRevenue = new Map<string, number[]>();
  for (const inv of realOrders) {
    for (const li of inv.lineItems) {
      if (!li.itemCode || li.unitCost === undefined) continue;
      const arr = monthlyItemRevenue.get(li.itemCode) ?? [];
      arr.push(li.lineAmount);
      monthlyItemRevenue.set(li.itemCode, arr);
    }
  }

  for (const [itemCode, points] of byItem) {
    const byMonth = groupBy(points, (p) => p.month as string);
    const months = [...byMonth.keys()].sort();
    if (months.length < 4) continue;
    const series = months.map((m) => mean(byMonth.get(m)!.map((p) => p.margin)));
    const first = mean(series.slice(0, 2));
    const last = mean(series.slice(-2));
    const driftPts = (first - last) * 100; // percentage points lost
    if (driftPts > 8) {
      // £ leaked per month ≈ mean monthly revenue on this line × margin points lost
      const revs = monthlyItemRevenue.get(itemCode) ?? [];
      const monthlyRev = revs.reduce((s, v) => s + v, 0) / months.length;
      signals.push({
        id: `margin-drift:${itemCode}`,
        category: "strategic",
        type: "margin-drift",
        severity: driftPts > 15 ? "high" : "medium",
        score: round(Math.min(1, driftPts / 30), 3),
        impact: round((monthlyRev * driftPts) / 100),
        title: `${itemCode} margin drifted ${round(first * 100)}% → ${round(last * 100)}% over ${months.length} months`,
        reasoning: [
          `Monthly margin series: ${series.map((m) => `${round(m * 100)}%`).join(" → ")}`,
          "Costs are creeping while price holds — reprice or renegotiate inputs",
        ],
        evidence: [{ label: `${itemCode} margin by month (${months[0]}–${months.at(-1)})` }],
        recommendedAction: { kind: "flag-review", note: `Review pricing/costs on ${itemCode}` },
      });
    }
  }

  // 16 — Churn-cohort match: fingerprint customers who went dormant, then find
  // active customers tracking the same pre-churn trajectory.
  const cadence = indexCadenceByContact(report.orderCadence);
  const patterns = indexByContact(report.paymentPatterns);
  const churned = report.orderCadence.filter((c) => c.segment === "dormant" && c.orderCount >= 3);

  if (churned.length > 0) {
    // Pre-churn fingerprint: how stretched their final order gap was vs their norm.
    const stretches: number[] = [];
    for (const c of churned) {
      const orders = sortByDateAsc(
        realOrders.filter((i) => i.contactId === c.contactId),
        (i) => i.issueDate,
      );
      if (orders.length < 3 || !c.frequencyDays) continue;
      const lastGap = daysBetween(orders[orders.length - 2]!.issueDate, orders[orders.length - 1]!.issueDate);
      stretches.push(lastGap / c.frequencyDays);
    }
    const cohortStretch = stretches.length ? mean(stretches) : 0;

    if (cohortStretch > 1.05) {
      for (const c of report.orderCadence) {
        if (c.segment !== "repeat" || !c.frequencyDays || c.orderCount < 3) continue;
        const currentStretch = c.recencyDays / c.frequencyDays;
        const worsening = patterns.get(c.contactId)?.trend === "worsening";
        // Match: gap already stretched like the churn cohort's final gap,
        // reinforced by worsening payment behaviour.
        if (currentStretch >= cohortStretch * 0.8 && (worsening || currentStretch >= cohortStretch)) {
          const name = contactName.get(c.contactId) ?? c.contactId;
          signals.push({
            id: `churn-cohort-match:${c.contactId}`,
            category: "strategic",
            type: "churn-cohort-match",
            severity: "high",
            score: round(Math.min(1, currentStretch / (cohortStretch * 1.5)), 3),
            // At risk: their typical order value — what one lost cycle costs.
            impact: round(
              (revenue.get(c.contactId) ?? 0) / Math.max(1, cadence.get(c.contactId)?.orderCount ?? 1),
            ),
            title: `${name} is behaving like customers ~2 months before they churned`,
            contactId: c.contactId,
            reasoning: [
              `Current order gap is ${round(currentStretch, 2)}× their normal cadence; churned customers averaged ${round(cohortStretch, 2)}× just before going quiet`,
              worsening ? "Payment behaviour is also worsening — same pattern the churn cohort showed" : "Order-gap stretch alone matches the churn cohort",
              "Intervene now: check in, offer an incentive, fix any service issue",
            ],
            evidence: [{ label: `Cohort of ${churned.length} churned customer(s)` }],
            recommendedAction: {
              kind: "create-quote",
              contactId: c.contactId,
              rationale: "Pre-emptive retention offer — churn-cohort trajectory match",
            },
          });
        }
      }
    }
  }

  return signals;
}
