import { daysBetween, round } from "../analysis/util.js";
import { isDistressed } from "../domain/company.js";
import type { Bill } from "../domain/types.js";
import type { Signal, SignalInputs } from "./types.js";

/**
 * Cash flow timing — money out.
 *
 * 11. bills-vs-receivables   → defer some, pay others, stay cash-positive
 * 12. early-payment-discount → discount available and cash allows → save
 * 13. supplier-distress      → CH-flagged supplier we depend on → risk flag
 */

const HORIZON_DAYS = 30;

export function cashflowTimingSignals(inputs: SignalInputs): Signal[] {
  const { snapshot, report, contextByContact } = inputs;
  const signals: Signal[] = [];
  const bills = (snapshot.bills ?? []).filter(
    (b) => b.status === "AUTHORISED" && b.amountDue > 0.005,
  );
  if (bills.length === 0 && !snapshot.bills) return signals; // money-out reads not enabled

  const dueWithin = (b: Bill, days: number) => {
    const d = daysBetween(snapshot.asOf, b.dueDate);
    return d >= 0 && d <= days;
  };

  // Expected inflows over the horizon: overdue expected-recoverable + open
  // invoices falling due in the window (assume 90% of on-time value lands).
  const overdueExpected = report.recoverable.totalExpectedRecoverable;
  const upcomingDue = snapshot.invoices
    .filter(
      (i) =>
        (i.status === "AUTHORISED" || i.status === "SUBMITTED") &&
        i.amountDue > 0.005 &&
        daysBetween(snapshot.asOf, i.dueDate) >= 0 &&
        daysBetween(snapshot.asOf, i.dueDate) <= HORIZON_DAYS,
    )
    .reduce((s, i) => s + i.amountDue, 0);
  const expectedIn = round(overdueExpected + upcomingDue * 0.9);

  const billsDue = bills.filter((b) => dueWithin(b, HORIZON_DAYS));
  const totalOut = round(billsDue.reduce((s, b) => s + b.amountDue, 0));

  // 11 — Bills vs receivables.
  if (billsDue.length > 0) {
    const gap = round(totalOut - expectedIn);
    const short = gap > 0;
    // Defer candidates: largest bills without an early-payment discount.
    const deferCandidates = [...billsDue]
      .filter((b) => !b.earlyPaymentDiscount)
      .sort((a, b) => b.amountDue - a.amountDue);
    const defer = short ? deferCandidates.slice(0, 2) : [];

    signals.push({
      id: `bills-vs-receivables:${snapshot.asOf}`,
      category: "cashflow-timing",
      type: "bills-vs-receivables",
      severity: short ? "high" : "info",
      score: short ? round(Math.min(1, gap / Math.max(totalOut, 1)), 3) : 0.1,
      title: short
        ? `Next ${HORIZON_DAYS}d: ${totalOut} out vs ~${expectedIn} in — ${gap} short; defer ${defer.map((b) => b.billId).join(", ")}`
        : `Next ${HORIZON_DAYS}d: cash-positive (${expectedIn} in vs ${totalOut} out)`,
      reasoning: [
        `Bills due within ${HORIZON_DAYS}d: ${totalOut} across ${billsDue.length} bills`,
        `Expected inflows: ${expectedIn} (overdue expected-recoverable ${overdueExpected} + ${round(upcomingDue * 0.9)} from invoices falling due)`,
        short
          ? `Shortfall of ${gap} — suggest deferring: ${defer.map((b) => `${b.billId} (${b.amountDue}, ${b.supplierName})`).join("; ")}`
          : "Inflows cover outflows — pay on schedule",
      ],
      evidence: billsDue.map((b) => ({ label: `${b.billId}: ${b.amountDue} due ${b.dueDate} (${b.supplierName})` })),
      recommendedAction: short
        ? { kind: "defer-bill", billId: defer[0]?.billId ?? billsDue[0]!.billId }
        : { kind: "flag-review", note: "Cash-positive for the coming month; no action needed" },
    });
  }

  // 12 — Early-payment discount worth taking (when cash allows).
  for (const bill of bills) {
    const epd = bill.earlyPaymentDiscount;
    if (!epd) continue;
    const daysLeft = daysBetween(snapshot.asOf, epd.ifPaidBy);
    if (daysLeft < 0) continue;
    const saving = round(bill.amountDue * (epd.percent / 100));
    const cashAllows = expectedIn - totalOut >= 0;
    signals.push({
      id: `early-payment-discount:${bill.billId}`,
      category: "cashflow-timing",
      type: "early-payment-discount",
      severity: cashAllows ? "medium" : "info",
      score: round(Math.min(1, saving / 500), 3),
      title: `Pay ${bill.billId} by ${epd.ifPaidBy} to save ${saving} (${epd.percent}%)`,
      billId: bill.billId,
      reasoning: [
        `${bill.supplierName} offers ${epd.percent}% off if paid by ${epd.ifPaidBy} (${daysLeft}d left)`,
        cashAllows
          ? `Projected cash position covers it — take the saving`
          : "Cash is tight this month — only take it if the position improves",
      ],
      evidence: [{ label: `${bill.billId}: ${bill.amountDue} due ${bill.dueDate}` }],
      recommendedAction: cashAllows
        ? { kind: "pay-bill-early", billId: bill.billId, saving }
        : { kind: "flag-review", note: `Discount available but cash-constrained (saving ${saving})` },
    });
  }

  // 13 — Supplier distress + dependency.
  const spendBySupplier = new Map<string, number>();
  for (const b of snapshot.bills ?? []) {
    spendBySupplier.set(b.supplierId, (spendBySupplier.get(b.supplierId) ?? 0) + b.total);
  }
  const totalSpend = [...spendBySupplier.values()].reduce((s, v) => s + v, 0);
  for (const supplier of snapshot.suppliers ?? []) {
    const ctx = supplier.contactId ? contextByContact.get(supplier.contactId) : undefined;
    if (!isDistressed(ctx)) continue;
    const spend = spendBySupplier.get(supplier.supplierId) ?? 0;
    const share = totalSpend > 0 ? spend / totalSpend : 0;
    if (share < 0.15) continue; // immaterial dependency
    signals.push({
      id: `supplier-distress:${supplier.supplierId}`,
      category: "cashflow-timing",
      type: "supplier-distress",
      severity: share > 0.4 ? "high" : "medium",
      score: round(share, 3),
      title: `Supplier ${supplier.name} shows distress flags — ${round(share * 100)}% of spend depends on them`,
      contactId: supplier.contactId,
      reasoning: [
        `Companies House flags: ${ctx!.companiesHouse!.flags.join(", ")}`,
        `${round(share * 100)}% of bill spend goes to ${supplier.name}`,
        "Line up an alternate supplier; be cautious with prepayments",
      ],
      evidence: [
        ...(ctx?.companiesHouse?.profileUrl
          ? [{ label: "Companies House profile", url: ctx.companiesHouse.profileUrl }]
          : []),
        ...(ctx?.companiesHouse?.filings.slice(0, 2).map((f) => ({
          label: `${f.date} ${f.description}`,
          url: f.pdfUrl,
        })) ?? []),
      ],
      recommendedAction: {
        kind: "flag-review",
        note: `Dependency risk on distressed supplier ${supplier.name}; source alternates, avoid prepaying`,
      },
    });
  }

  return signals;
}
