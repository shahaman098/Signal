import { daysBetween, groupBy, round, sortByDateAsc } from "../analysis/util.js";
import type { Invoice } from "../domain/types.js";
import type { Signal, SignalInputs } from "./types.js";

/**
 * Token-set Jaccard similarity over the line-item descriptions of two
 * invoices. 1 = identical wording, 0 = nothing in common. Invoices without
 * descriptions compare as similar (no evidence either way).
 */
export function descriptionSimilarity(a: Invoice, b: Invoice): number {
  const tokens = (inv: Invoice) =>
    new Set(
      inv.lineItems
        .map((li) => li.description.toLowerCase())
        .join(" ")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Anomaly / hygiene.
 *
 * 17. duplicate-invoice → same contact, ~same amount, issued within days
 * 18. amount-anomaly    → invoice far off the customer's historical average
 * 19. terms-change      → unusual payment-terms shift vs the customer's norm
 */
export function anomalySignals(inputs: SignalInputs): Signal[] {
  const { snapshot } = inputs;
  const signals: Signal[] = [];
  const contactName = new Map(snapshot.contacts.map((c) => [c.contactId, c.name]));

  const live = snapshot.invoices.filter((i) => i.status !== "VOIDED" && i.status !== "DELETED");
  const byContact = groupBy(live, (i) => i.contactId);

  for (const [contactId, invoices] of byContact) {
    const name = contactName.get(contactId) ?? contactId;
    const ordered = sortByDateAsc(invoices, (i) => i.issueDate);

    // 17 — Duplicates: same total (±0.5%), issued within 7 days, AND similar
    // line-item descriptions (token Jaccard ≥ 0.5) — two different services
    // that happen to cost the same are not a duplicate.
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i]!;
        const b = ordered[j]!;
        const gap = Math.abs(daysBetween(a.issueDate, b.issueDate));
        if (gap > 7) continue;
        const near = Math.abs(a.total - b.total) <= Math.max(a.total, b.total) * 0.005;
        if (!near || a.total === 0) continue;
        if (descriptionSimilarity(a, b) < 0.5) continue;
        signals.push({
          id: `duplicate-invoice:${a.invoiceId}:${b.invoiceId}`,
          category: "anomaly",
          type: "duplicate-invoice",
          severity: "high",
          score: 0.9,
          impact: a.total,
          title: `Possible duplicate: ${a.invoiceNumber ?? a.invoiceId} & ${b.invoiceNumber ?? b.invoiceId} (${name}, both ${a.total})`,
          contactId,
          invoiceId: b.invoiceId,
          reasoning: [
            `Identical totals (${a.total}) issued ${gap} day(s) apart to the same customer`,
            "Review before the customer disputes or double-pays",
          ],
          evidence: [
            { label: `${a.invoiceNumber ?? a.invoiceId} issued ${a.issueDate}` },
            { label: `${b.invoiceNumber ?? b.invoiceId} issued ${b.issueDate}` },
          ],
          recommendedAction: { kind: "flag-review", note: `Check ${b.invoiceId} against ${a.invoiceId} for duplication` },
        });
      }
    }

    // 18 — Amount anomaly: latest invoice vs historical median (needs ≥3 history).
    if (ordered.length >= 4) {
      const latest = ordered.at(-1)!;
      const history = ordered.slice(0, -1).map((i) => i.total).sort((x, y) => x - y);
      const median = history[Math.floor(history.length / 2)]!;
      if (median > 0 && (latest.total > median * 3 || latest.total < median / 3)) {
        const ratio = round(latest.total / median, 1);
        signals.push({
          id: `amount-anomaly:${latest.invoiceId}`,
          category: "anomaly",
          type: "amount-anomaly",
          severity: latest.status === "DRAFT" ? "medium" : "high",
          score: round(Math.min(1, Math.abs(Math.log10(ratio || 1))), 3),
          impact: round(Math.abs(latest.total - median)),
          title: `${latest.invoiceNumber ?? latest.invoiceId} is ${ratio}× ${name}'s typical amount — verify`,
          contactId,
          invoiceId: latest.invoiceId,
          reasoning: [
            `Invoice total ${latest.total} vs historical median ${median}`,
            latest.status === "DRAFT"
              ? "Still a draft — verify before sending"
              : "Already issued — verify it was intentional",
          ],
          evidence: [{ label: `History medians from ${history.length} prior invoices` }],
          recommendedAction: {
            kind: "flag-review",
            note: `Verify ${latest.invoiceId} amount (${latest.total}) against expected ~${median}`,
          },
        });
      }
    }

    // 19 — Terms change: latest terms vs the customer's modal terms.
    if (ordered.length >= 3) {
      const terms = ordered.map((i) => daysBetween(i.issueDate, i.dueDate));
      const latestTerms = terms.at(-1)!;
      const historyTerms = terms.slice(0, -1);
      const counts = new Map<number, number>();
      for (const t of historyTerms) counts.set(t, (counts.get(t) ?? 0) + 1);
      const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      if (modal > 0 && (latestTerms >= modal * 2 || latestTerms <= modal / 2) && Math.abs(latestTerms - modal) >= 14) {
        const latest = ordered.at(-1)!;
        signals.push({
          id: `terms-change:${latest.invoiceId}`,
          category: "anomaly",
          type: "terms-change",
          severity: "medium",
          score: round(Math.min(1, Math.abs(latestTerms - modal) / 60), 3),
          impact: ordered.at(-1)!.total,
          title: `${name}: payment terms jumped ${modal}d → ${latestTerms}d on ${latest.invoiceNumber ?? latest.invoiceId}`,
          contactId,
          invoiceId: latest.invoiceId,
          reasoning: [
            `Customer's usual terms are ${modal} days; this invoice gives ${latestTerms}`,
            "Unusual terms changes can hide errors or unapproved concessions",
          ],
          evidence: [{ label: `Terms history: ${historyTerms.join(", ")} → ${latestTerms}` }],
          recommendedAction: { kind: "flag-review", note: `Confirm the ${latestTerms}-day terms on ${latest.invoiceId} were intended` },
        });
      }
    }
  }

  return signals;
}
