import { describe, expect, it } from "vitest";
import { makeDemoCompanyContexts, makeEnrichedDemoSnapshot } from "../testing/demo-enriched.js";
import { runSignalEngine } from "./engine.js";
import type { Signal, SignalType } from "./types.js";

const snapshot = { ...makeEnrichedDemoSnapshot(), companyContexts: makeDemoCompanyContexts() };
const result = runSignalEngine(snapshot);

function ofType(type: SignalType): Signal[] {
  return result.signals.filter((s) => s.type === type);
}
function one(type: SignalType, predicate?: (s: Signal) => boolean): Signal {
  const matches = ofType(type).filter(predicate ?? (() => true));
  expect(matches.length, `expected a ${type} signal`).toBeGreaterThan(0);
  return matches[0]!;
}

describe("signal engine — cash recovery", () => {
  it("tone-matches a plain overdue chase to payment history", () => {
    // Chris's smaller overdue invoice isn't high-band → plain chase, firm tone
    // (avg >14d late, worsening) unless escalated. Any overdue-chase must carry a tone.
    for (const s of ofType("overdue-chase")) {
      expect(s.recommendedAction.kind).toBe("chase-email");
      if (s.recommendedAction.kind === "chase-email") {
        expect(["soft", "friendly", "firm", "urgent"]).toContain(s.recommendedAction.tone);
      }
    }
  });

  it("escalates the chronic payer's high-slip-risk invoice with a firm chase", () => {
    const s = one("slip-risk-escalation", (x) => x.contactId === "contact-chronic");
    expect(s.severity).toBe("high");
    if (s.recommendedAction.kind === "chase-email") expect(s.recommendedAction.tone).toBe("firm");
    expect(s.reasoning.join(" ")).toMatch(/worsening/);
  });

  it("flags the CH-distressed customer for urgent collection, no terms", () => {
    const s = one("distress-collection", (x) => x.contactId === "contact-distress");
    expect(s.severity).toBe("urgent");
    expect(s.reasoning.join(" ")).toMatch(/gazette-strike-off-notice/);
    expect(s.reasoning.join(" ")).toMatch(/do not propose a payment plan/i);
    // Evidence must link to Companies House (profile / filing PDFs).
    expect(s.evidence.some((e) => e.url?.includes("company-information.service.gov.uk"))).toBe(true);
  });

  it("chases the balance on a short-paid invoice", () => {
    const s = one("partial-payment-followup", (x) => x.contactId === "contact-partial");
    expect(s.reasoning.join(" ")).toMatch(/Paid 1200 of 2000/);
  });

  it("soft-nudges the chronic-but-reliable payer and suggests upfront terms", () => {
    const s = one("chronic-payer-soft-nudge", (x) => x.contactId === "contact-slowpay");
    expect(s.severity).toBe("medium");
    expect(s.recommendedAction.kind).toBe("suggest-upfront-terms");
  });
});

describe("signal engine — revenue growth", () => {
  it("proposes recurring conversion for steady same-item repeat buyers", () => {
    const s = one("recurring-conversion", (x) => x.contactId === "contact-reliable");
    expect(s.recommendedAction).toMatchObject({ kind: "convert-recurring", itemCode: "SVC-A" });
  });

  it("targets the lapsed high-value customer with a reactivation offer", () => {
    const s = one("reactivation-offer", (x) => x.contactId === "contact-lapsed");
    expect(s.severity).toBe("high");
    expect(s.recommendedAction.kind).toBe("create-quote");
  });

  it("catches the shrinking basket before the customer lapses", () => {
    const s = one("shrinking-basket-winback", (x) => x.contactId === "contact-shrinking");
    expect(s.reasoning.join(" ")).toMatch(/declined/i);
  });

  it("cross-sells SVC-B to an SVC-A-only buyer matching the peer profile", () => {
    const s = one("cross-sell", (x) => x.contactId === "contact-reliable");
    expect(s.title).toMatch(/SVC-B/);
  });

  it("times an upsell to positive news, citing the source link", () => {
    const s = one("good-news-upsell", (x) => x.contactId === "contact-goodnews");
    expect(s.reasoning.join(" ")).toMatch(/£2m seed round/);
    expect(s.evidence.some((e) => e.url?.startsWith("https://"))).toBe(true);
  });
});

describe("signal engine — cashflow timing", () => {
  it("weighs bills due against expected receivables", () => {
    const s = one("bills-vs-receivables");
    expect(s.reasoning.join(" ")).toMatch(/Bills due within 30d/);
    expect(s.reasoning.join(" ")).toMatch(/Expected inflows/);
  });

  it("surfaces the early-payment discount opportunity with the saving", () => {
    const s = one("early-payment-discount", (x) => x.billId === "bill-software");
    expect(s.title).toMatch(/save 18/); // 2% of 900
  });

  it("flags dependency on a distressed supplier", () => {
    const s = one("supplier-distress");
    expect(s.reasoning.join(" ")).toMatch(/accounts-overdue/);
    expect(s.reasoning.join(" ")).toMatch(/alternate/i);
  });
});

describe("signal engine — strategic", () => {
  it("reports customer concentration with the top-3 share", () => {
    const s = one("concentration-risk");
    expect(s.title).toMatch(/% of revenue sits with 3 clients/);
    expect(s.score).toBeGreaterThan(0.5);
  });

  it("detects margin drift on SVC-A from rising unit costs", () => {
    const s = one("margin-drift");
    expect(s.title).toMatch(/SVC-A/);
    expect(s.severity).toBe("high"); // 45% → 15% is > 15pt drift
  });

  it("matches Casey to the churn cohort's pre-churn trajectory", () => {
    const s = one("churn-cohort-match", (x) => x.contactId === "contact-cohort");
    expect(s.reasoning.join(" ")).toMatch(/churned customers averaged/i);
  });
});

describe("signal engine — anomaly / hygiene", () => {
  it("flags the near-duplicate invoice pair", () => {
    const s = one("duplicate-invoice", (x) => x.contactId === "contact-reliable");
    expect(s.reasoning.join(" ")).toMatch(/Identical totals/);
  });

  it("flags the draft that is 5.2× the customer's typical amount", () => {
    const s = one("amount-anomaly", (x) => x.contactId === "contact-reliable");
    expect(s.reasoning.join(" ")).toMatch(/verify before sending/i);
  });

  it("flags the sudden 14d → 60d terms change", () => {
    const s = one("terms-change", (x) => x.contactId === "contact-terms");
    expect(s.title).toMatch(/14d → 60d/);
  });
});

describe("signal engine — impact", () => {
  it("attaches money-at-stake to recovery and growth signals", () => {
    const distress = one("distress-collection");
    expect(distress.impact).toBe(1200); // Dana's open balance
    const escalation = one("slip-risk-escalation", (s) => s.contactId === "contact-chronic");
    expect(escalation.impact).toBe(3500);
    const reactivation = one("reactivation-offer");
    expect(reactivation.impact).toBeGreaterThan(0); // Lucy's median order
    const discount = one("early-payment-discount");
    expect(discount.impact).toBe(18); // 2% of 900
    const drift = one("margin-drift");
    expect(drift.impact).toBeGreaterThan(0); // monthly £ leak, not just %
  });

  it("ranks by impact within a severity band", () => {
    const highs = result.signals.filter((s) => s.severity === "high");
    for (let i = 1; i < highs.length; i++) {
      expect((highs[i - 1]!.impact ?? 0) >= (highs[i]!.impact ?? 0)).toBe(true);
    }
  });
});

describe("signal engine — prioritisation", () => {
  it("covers all five categories", () => {
    expect(result.countsByCategory["cash-recovery"]).toBeGreaterThan(0);
    expect(result.countsByCategory["revenue-growth"]).toBeGreaterThan(0);
    expect(result.countsByCategory["cashflow-timing"]).toBeGreaterThan(0);
    expect(result.countsByCategory.strategic).toBeGreaterThan(0);
    expect(result.countsByCategory.anomaly).toBeGreaterThan(0);
  });

  it("puts urgent signals first and keeps one cash-recovery signal per invoice", () => {
    expect(result.signals[0]!.severity).toBe("urgent");
    const cashByInvoice = result.signals
      .filter((s) => s.category === "cash-recovery" && s.invoiceId)
      .map((s) => s.invoiceId!);
    expect(new Set(cashByInvoice).size).toBe(cashByInvoice.length);
  });

  it("never emits a payment-plan recommendation for a distressed customer", () => {
    const distress = ofType("distress-collection");
    for (const s of distress) {
      expect(s.recommendedAction.kind).toBe("chase-email");
      expect(s.reasoning.join(" ")).toMatch(/before any payment terms/i);
    }
  });
});
