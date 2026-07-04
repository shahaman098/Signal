import { indexCadenceByContact } from "../analysis/order-cadence.js";
import { groupBy, mean, round, sortByDateAsc } from "../analysis/util.js";
import { recentPositiveNews } from "../domain/company.js";
import type { Signal, SignalInputs } from "./types.js";

/**
 * Revenue growth — money on the table.
 *
 *  6. recurring-conversion    → repeat buyer of same item → recurring quote/invoice
 *  7. reactivation-offer      → lapsed high-value customer → drafted quote
 *  8. shrinking-basket-winback→ ordering less each cycle → early win-back
 *  9. cross-sell              → buys line A, fits profile of line-B buyers
 * 10. good-news-upsell        → funding/expansion news → timed upsell
 */
export function revenueGrowthSignals(inputs: SignalInputs): Signal[] {
  const { snapshot, report, contextByContact } = inputs;
  const cadence = indexCadenceByContact(report.orderCadence);
  const contactName = new Map(snapshot.contacts.map((c) => [c.contactId, c.name]));
  const churnByContact = new Map(report.churn.map((c) => [c.contactId, c]));
  const signals: Signal[] = [];

  const realOrders = snapshot.invoices.filter(
    (i) => i.status !== "VOIDED" && i.status !== "DELETED" && i.status !== "DRAFT",
  );
  const byContact = groupBy(realOrders, (i) => i.contactId);

  // Revenue per contact (for "high-value" tests).
  const revenue = new Map<string, number>();
  for (const [cid, invs] of byContact) revenue.set(cid, invs.reduce((s, i) => s + i.total, 0));
  const revenues = [...revenue.values()].sort((a, b) => a - b);
  const medianRevenue = revenues.length ? revenues[Math.floor(revenues.length / 2)]! : 0;

  // Item purchase map for cross-sell profiling.
  const itemsBought = new Map<string, Set<string>>(); // contactId -> item codes
  for (const inv of realOrders) {
    let set = itemsBought.get(inv.contactId);
    if (!set) itemsBought.set(inv.contactId, (set = new Set()));
    for (const li of inv.lineItems) if (li.itemCode) set.add(li.itemCode);
  }

  for (const [contactId, invoices] of byContact) {
    const name = contactName.get(contactId) ?? contactId;
    const cad = cadence.get(contactId);
    const ordered = sortByDateAsc(invoices, (i) => i.issueDate);

    // 6 — Recurring conversion: ≥4 orders of the same item on a steady cadence.
    if (cad && cad.orderCount >= 4 && cad.segment === "repeat") {
      const itemCounts = new Map<string, number>();
      for (const inv of ordered)
        for (const li of inv.lineItems)
          if (li.itemCode) itemCounts.set(li.itemCode, (itemCounts.get(li.itemCode) ?? 0) + 1);
      const [topItem, count] = [...itemCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (topItem && count! >= 4) {
        signals.push({
          id: `recurring-conversion:${contactId}`,
          category: "revenue-growth",
          type: "recurring-conversion",
          severity: "medium",
          score: round(Math.min(1, count! / 8), 3),
          title: `${name} buys ${topItem} every ~${cad.frequencyDays}d — convert to recurring`,
          contactId,
          reasoning: [
            `${count} orders of ${topItem} at a ~${cad.frequencyDays}-day cadence`,
            "A recurring quote/invoice locks in the revenue and saves both sides admin",
          ],
          evidence: [{ label: `${cad.orderCount} orders, last ${cad.lastOrderDate}` }],
          recommendedAction: { kind: "convert-recurring", contactId, itemCode: topItem },
        });
      }
    }

    // 7 — Reactivation: lapsed/dormant AND historically above-median value.
    if (cad && (cad.segment === "lapsed" || cad.segment === "dormant") && cad.orderCount >= 3) {
      const rev = revenue.get(contactId) ?? 0;
      if (rev >= medianRevenue) {
        signals.push({
          id: `reactivation-offer:${contactId}`,
          category: "revenue-growth",
          type: "reactivation-offer",
          severity: "high",
          score: churnByContact.get(contactId)?.score ?? 0.7,
          title: `${name}: high-value customer gone quiet ${cad.recencyDays}d — send reactivation offer`,
          contactId,
          reasoning: [
            `Lifetime revenue ${rev} (median is ${medianRevenue})`,
            `No orders for ${cad.recencyDays} days vs a ${cad.frequencyDays}-day historical cadence`,
            "Draft a welcome-back quote based on their usual order",
          ],
          evidence: [{ label: `Last order ${cad.lastOrderDate}` }],
          recommendedAction: {
            kind: "create-quote",
            contactId,
            rationale: "Reactivation offer for lapsed high-value customer",
          },
        });
      }
    }

    // 8 — Shrinking basket: last 3+ order totals strictly declining, >25% drop,
    // customer not yet lapsed → win back early.
    if (cad && cad.segment === "repeat" && ordered.length >= 3) {
      const last3 = ordered.slice(-3).map((i) => i.total);
      const strictlyDeclining = last3[0]! > last3[1]! && last3[1]! > last3[2]!;
      const drop = last3[0]! > 0 ? (last3[0]! - last3[2]!) / last3[0]! : 0;
      if (strictlyDeclining && drop > 0.25) {
        signals.push({
          id: `shrinking-basket-winback:${contactId}`,
          category: "revenue-growth",
          type: "shrinking-basket-winback",
          severity: "high",
          score: round(drop, 3),
          title: `${name}: basket shrinking ${last3.join(" → ")} — win back before they lapse`,
          contactId,
          reasoning: [
            `Order value declined ${round(drop * 100)}% over the last three cycles`,
            "Still ordering — early intervention beats a reactivation later",
          ],
          evidence: [{ label: `Last 3 orders: ${last3.join(", ")}` }],
          recommendedAction: {
            kind: "create-quote",
            contactId,
            rationale: "Early win-back offer for shrinking basket",
          },
        });
      }
    }

    // 10 — Good-news upsell: active customer with recent positive news.
    const goodNews = recentPositiveNews(contextByContact.get(contactId), snapshot.asOf);
    if (goodNews.length > 0 && cad && cad.segment !== "dormant") {
      const top = goodNews[0]!;
      signals.push({
        id: `good-news-upsell:${contactId}`,
        category: "revenue-growth",
        type: "good-news-upsell",
        severity: "medium",
        score: 0.6,
        title: `${name} just had good news ("${top.title}") — timed upsell`,
        contactId,
        reasoning: [
          `${top.source}: "${top.title}" (${top.date})`,
          "Funding/expansion is the moment budgets open — propose an upgrade now",
        ],
        evidence: goodNews.map((n) => ({ label: `${n.source}: ${n.title}`, url: n.url })),
        recommendedAction: {
          kind: "create-quote",
          contactId,
          rationale: `Upsell timed to news: ${top.title}`,
        },
      });
    }
  }

  // 9 — Cross-sell: customer buys A; peers who buy A also buy B; customer lacks B.
  signals.push(...crossSellSignals(itemsBought, contactName));

  return signals;
}

function crossSellSignals(
  itemsBought: Map<string, Set<string>>,
  contactName: Map<string, string>,
): Signal[] {
  const signals: Signal[] = [];
  for (const [contactId, items] of itemsBought) {
    for (const itemA of items) {
      // Peers who also buy itemA.
      const peers = [...itemsBought.entries()].filter(
        ([cid, set]) => cid !== contactId && set.has(itemA),
      );
      if (peers.length < 2) continue;
      // Items ≥ half those peers buy that this customer doesn't.
      const counts = new Map<string, number>();
      for (const [, set] of peers)
        for (const item of set) if (item !== itemA && !items.has(item)) counts.set(item, (counts.get(item) ?? 0) + 1);
      for (const [itemB, n] of counts) {
        if (n / peers.length < 0.5) continue;
        const name = contactName.get(contactId) ?? contactId;
        signals.push({
          id: `cross-sell:${contactId}:${itemB}`,
          category: "revenue-growth",
          type: "cross-sell",
          severity: "info",
          score: round(n / peers.length, 3),
          title: `${name} fits the ${itemB}-buyer profile — cross-sell`,
          contactId,
          reasoning: [
            `${n} of ${peers.length} customers who buy ${itemA} also buy ${itemB}`,
            `${name} buys ${itemA} but not ${itemB}`,
          ],
          evidence: [{ label: `Peer overlap ${n}/${peers.length} on ${itemA} → ${itemB}` }],
          recommendedAction: {
            kind: "create-quote",
            contactId,
            rationale: `Cross-sell ${itemB} to a ${itemA} buyer`,
          },
        });
      }
    }
  }
  // Dedupe by contact+item (itemA loop can produce the same suggestion twice).
  const seen = new Set<string>();
  return signals.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}
