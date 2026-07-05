import { indexByContact } from "../analysis/payment-pattern.js";
import { daysBetween, round, saturate } from "../analysis/util.js";
import { isDistressed } from "../domain/company.js";
import type { Invoice } from "../domain/types.js";
import type { ChaseTone, Signal, SignalInputs } from "./types.js";

/**
 * Cash recovery — money owed to you.
 *
 *  1. overdue-chase            → chase email, tone-matched to payment history
 *  2. slip-risk-escalation     → firmer chase, prioritised now
 *  3. distress-collection      → CH-flagged customer: collect urgently, no terms
 *  4. partial-payment-followup → short payment: chase the balance
 *  5. chronic-payer-soft-nudge → always-late-but-always-pays: soft nudge + upfront terms
 */
export function cashRecoverySignals(inputs: SignalInputs): Signal[] {
  const { snapshot, report, contextByContact } = inputs;
  const patterns = indexByContact(report.paymentPatterns);
  const riskByInvoice = new Map(report.slipRisk.map((r) => [r.invoiceId, r]));
  const contactName = new Map(snapshot.contacts.map((c) => [c.contactId, c.name]));

  const signals: Signal[] = [];
  const openPastDue = (inv: Invoice) =>
    (inv.status === "AUTHORISED" || inv.status === "SUBMITTED") &&
    inv.amountDue > 0.005 &&
    daysBetween(inv.dueDate, snapshot.asOf) > 0;

  // Track which invoices already got a more specific signal so plain
  // overdue-chase only covers the remainder.
  const covered = new Set<string>();

  for (const inv of snapshot.invoices) {
    const ctx = contextByContact.get(inv.contactId);
    const name = contactName.get(inv.contactId) ?? inv.contactId;
    const pattern = patterns.get(inv.contactId);
    const risk = riskByInvoice.get(inv.invoiceId);
    const isOpen =
      (inv.status === "AUTHORISED" || inv.status === "SUBMITTED") && inv.amountDue > 0.005;

    // 3 — Distress collection: any open balance with a CH distress flag is
    // urgent even before it's overdue. Collect first; do NOT offer terms.
    if (isOpen && isDistressed(ctx)) {
      covered.add(inv.invoiceId);
      const flags = (ctx!.companiesHouse!.flags ?? []).join(", ");
      signals.push({
        id: `distress-collection:${inv.invoiceId}`,
        category: "cash-recovery",
        type: "distress-collection",
        severity: "urgent",
        score: 1,
        impact: inv.amountDue,
        title: `Collect ${inv.amountDue} from ${name} urgently — Companies House distress flags`,
        contactId: inv.contactId,
        invoiceId: inv.invoiceId,
        reasoning: [
          `Companies House flags: ${flags}`,
          `Open balance of ${inv.amountDue} (due ${inv.dueDate})`,
          "Prioritise collection before any payment terms are offered — do not propose a payment plan",
        ],
        evidence: chEvidence(ctx),
        recommendedAction: {
          kind: "chase-email",
          invoiceId: inv.invoiceId,
          tone: "urgent",
          note: "Customer shows Companies House distress markers; collect before offering terms.",
        },
      });
      continue;
    }

    if (!openPastDue(inv)) continue;

    // 4 — Partial / short payment: some money arrived, balance still owing.
    if (inv.amountPaid > 0.005) {
      covered.add(inv.invoiceId);
      signals.push({
        id: `partial-payment-followup:${inv.invoiceId}`,
        category: "cash-recovery",
        type: "partial-payment-followup",
        severity: "high",
        score: round(saturate(inv.amountDue, inv.total), 3),
        impact: inv.amountDue,
        title: `${name} short-paid ${inv.invoiceNumber ?? inv.invoiceId}: ${inv.amountDue} outstanding`,
        contactId: inv.contactId,
        invoiceId: inv.invoiceId,
        reasoning: [
          `Paid ${inv.amountPaid} of ${inv.total}; ${inv.amountDue} remains`,
          `Balance is ${daysBetween(inv.dueDate, snapshot.asOf)} days past due`,
        ],
        evidence: [{ label: `Invoice ${inv.invoiceNumber ?? inv.invoiceId}` }],
        recommendedAction: {
          kind: "chase-email",
          invoiceId: inv.invoiceId,
          tone: "friendly",
          note: "Acknowledge the partial payment, request the remaining balance.",
        },
      });
      continue;
    }

    // 2 — Slip-risk escalation: pattern worsening or already high risk.
    const escalate =
      risk && (risk.band === "high" || (risk.band === "medium" && pattern?.trend === "worsening"));
    if (escalate) {
      covered.add(inv.invoiceId);
      signals.push({
        id: `slip-risk-escalation:${inv.invoiceId}`,
        category: "cash-recovery",
        type: "slip-risk-escalation",
        severity: "high",
        score: risk.score,
        impact: inv.amountDue,
        title: `Escalate ${inv.invoiceNumber ?? inv.invoiceId} (${name}) — slip risk ${risk.score}`,
        contactId: inv.contactId,
        invoiceId: inv.invoiceId,
        reasoning: risk.reasons,
        evidence: [{ label: `Invoice ${inv.invoiceNumber ?? inv.invoiceId}` }],
        recommendedAction: { kind: "chase-email", invoiceId: inv.invoiceId, tone: "firm" },
      });
      continue;
    }

    // 5 — Chronic-but-reliable: habitually late, trend not worsening, history of
    // always settling → soft nudge only, and suggest upfront terms.
    const chronicReliable =
      pattern &&
      pattern.sampleSize >= 3 &&
      pattern.avgDaysLate > 7 &&
      pattern.trend !== "worsening";
    if (chronicReliable) {
      covered.add(inv.invoiceId);
      signals.push({
        id: `chronic-payer-soft-nudge:${inv.invoiceId}`,
        category: "cash-recovery",
        type: "chronic-payer-soft-nudge",
        severity: "medium",
        score: round(saturate(pattern.avgDaysLate, 30), 3),
        impact: inv.amountDue,
        title: `${name}: habitual late payer who always settles — soft nudge only`,
        contactId: inv.contactId,
        invoiceId: inv.invoiceId,
        reasoning: [
          `Settled ${pattern.sampleSize} invoices, averaging ${pattern.avgDaysLate}d late, trend ${pattern.trend}`,
          "Reliable payer — avoid a heavy-handed chase",
          "Consider proposing upfront or shorter payment terms instead",
        ],
        evidence: [{ label: `Invoice ${inv.invoiceNumber ?? inv.invoiceId}` }],
        recommendedAction: { kind: "suggest-upfront-terms", contactId: inv.contactId },
      });
      continue;
    }

    // 1 — Plain overdue chase, tone matched to history.
    let tone: ChaseTone = "friendly";
    if (pattern && pattern.sampleSize >= 2) {
      if (pattern.avgDaysLate <= 2 && pattern.trend !== "worsening") tone = "soft";
      else if (pattern.avgDaysLate > 14 || pattern.trend === "worsening") tone = "firm";
    }
    signals.push({
      id: `overdue-chase:${inv.invoiceId}`,
      category: "cash-recovery",
      type: "overdue-chase",
      severity: "medium",
      score: risk?.score ?? 0.3,
      impact: inv.amountDue,
      title: `Chase ${inv.invoiceNumber ?? inv.invoiceId} (${name}) — ${daysBetween(inv.dueDate, snapshot.asOf)}d overdue`,
      contactId: inv.contactId,
      invoiceId: inv.invoiceId,
      reasoning: [
        `${inv.amountDue} overdue since ${inv.dueDate}`,
        pattern && pattern.sampleSize > 0
          ? `Tone "${tone}" matched to history (avg ${pattern.avgDaysLate}d late, trend ${pattern.trend})`
          : `No payment history — default "${tone}" tone`,
      ],
      evidence: [{ label: `Invoice ${inv.invoiceNumber ?? inv.invoiceId}` }],
      recommendedAction: { kind: "chase-email", invoiceId: inv.invoiceId, tone },
    });
  }

  return signals;
}

function chEvidence(ctx: ReturnType<SignalInputs["contextByContact"]["get"]>): Signal["evidence"] {
  if (!ctx?.companiesHouse) return [];
  const ev: Signal["evidence"] = [];
  if (ctx.companiesHouse.profileUrl) {
    ev.push({ label: "Companies House profile", url: ctx.companiesHouse.profileUrl });
  }
  for (const f of (ctx.companiesHouse.filings ?? []).slice(0, 3)) {
    ev.push({ label: `${f.date} ${f.description}`, url: f.pdfUrl });
  }
  return ev;
}
