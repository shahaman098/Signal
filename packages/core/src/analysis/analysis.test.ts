import { describe, expect, it } from "vitest";
import { makeDemoSnapshot, AS_OF } from "../testing/demo-data.js";
import { computePaymentPatterns, indexByContact } from "./payment-pattern.js";
import { computeOrderCadence, indexCadenceByContact } from "./order-cadence.js";
import { computeSlipRisk, isOverdue } from "./slip-risk.js";
import { computeRecoverable } from "./recoverable.js";
import { computeChurnSignals } from "./churn.js";
import { buildReceivablesReport } from "./report.js";
import { daysBetween, saturate, clamp01, median, stddev, olsSlope, logistic, shrink } from "./util.js";

const snapshot = makeDemoSnapshot();

describe("util", () => {
  it("computes whole-day differences with sign", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
    expect(daysBetween("2026-01-11", "2026-01-01")).toBe(-10);
  });

  it("saturates and clamps", () => {
    expect(saturate(45, 90)).toBe(0.5);
    expect(saturate(120, 90)).toBe(1);
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(3)).toBe(1);
  });

  it("median is robust to outliers", () => {
    expect(median([30, 30, 30, 200])).toBe(30);
    expect(median([1, 2, 3])).toBe(2);
    expect(median([])).toBe(0);
  });

  it("stddev computes population spread", () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
    expect(stddev([5])).toBe(0);
  });

  it("olsSlope fits a linear trend", () => {
    expect(olsSlope([0, 1, 2, 3].map((x) => ({ x, y: 10 + 5 * x })))).toBeCloseTo(5, 6);
    expect(olsSlope([{ x: 0, y: 1 }])).toBe(0); // insufficient data
    expect(olsSlope([0, 1, 2, 3].map((x) => ({ x, y: 7 })))).toBe(0); // flat
  });

  it("logistic maps ℝ → (0,1) with 0.5 at zero", () => {
    expect(logistic(0)).toBe(0.5);
    expect(logistic(10)).toBeGreaterThan(0.99);
    expect(logistic(-10)).toBeLessThan(0.01);
  });

  it("empirical-Bayes shrinkage pulls small samples toward the prior", () => {
    expect(shrink(30, 0, 7, 3)).toBe(7); // no data → prior
    expect(shrink(30, 3, 7, 3)).toBeCloseTo(18.5, 5); // half-weight
    expect(shrink(30, 300, 7, 3)).toBeCloseTo(29.77, 1); // data dominates
  });
});

describe("payment patterns", () => {
  const patterns = indexByContact(computePaymentPatterns(snapshot));

  it("flags reliable payers as paying early with a stable/known trend", () => {
    const rita = patterns.get("contact-reliable")!;
    expect(rita.sampleSize).toBe(6);
    expect(rita.avgDaysLate).toBeLessThan(0); // pays ~2 days early
    expect(["stable", "improving"]).toContain(rita.trend);
  });

  it("detects worsening payment behaviour for chronic late payers", () => {
    const chris = patterns.get("contact-chronic")!;
    expect(chris.avgDaysLate).toBeGreaterThan(15);
    expect(chris.recentAvgDaysLate).toBeGreaterThan(chris.avgDaysLate);
    expect(chris.trend).toBe("worsening");
  });

  it("returns an unknown trend when there is no settled history", () => {
    const withUnpaid = makeDemoSnapshot();
    withUnpaid.payments = []; // nothing settled
    const p = indexByContact(computePaymentPatterns(withUnpaid)).get("contact-reliable")!;
    expect(p.sampleSize).toBe(0);
    expect(p.trend).toBe("unknown");
    expect(p.reliability).toBe(0);
  });
});

describe("order cadence", () => {
  const cadence = indexCadenceByContact(computeOrderCadence(snapshot));

  it("classifies a recent, repeat customer", () => {
    const rita = cadence.get("contact-reliable")!;
    expect(rita.orderCount).toBeGreaterThanOrEqual(6);
    expect(rita.frequencyDays).toBeGreaterThan(25);
    expect(rita.frequencyDays).toBeLessThanOrEqual(30);
    expect(rita.segment).toBe("repeat");
    expect(rita.recencyDays).toBeLessThan(40);
  });

  it("classifies a long-silent customer as lapsed/dormant and overdue for reorder", () => {
    const lucy = cadence.get("contact-lapsed")!;
    expect(["lapsed", "dormant"]).toContain(lucy.segment);
    expect(lucy.overdueForReorder).toBe(true);
    expect(lucy.recencyDays).toBeGreaterThan(180);
  });

  it("classifies a single recent order as new", () => {
    expect(cadence.get("contact-new")!.segment).toBe("new");
  });
});

describe("slip risk", () => {
  const risks = computeSlipRisk(snapshot);

  it("only scores overdue, collectible invoices", () => {
    const overdue = snapshot.invoices.filter((i) => isOverdue(i, AS_OF));
    expect(risks).toHaveLength(overdue.length);
    // Rita's not-yet-due invoice must not appear.
    expect(risks.find((r) => r.invoiceId === "inv-rita-current")).toBeUndefined();
  });

  it("ranks the chronic payer's oldest overdue invoice highest", () => {
    expect(risks[0]!.contactId).toBe("contact-chronic");
    expect(risks[0]!.band).toBe("high");
    expect(risks[0]!.score).toBeGreaterThan(0.6);
  });

  it("is sorted by descending score and stays within [0,1]", () => {
    for (let i = 1; i < risks.length; i++) {
      expect(risks[i - 1]!.score).toBeGreaterThanOrEqual(risks[i]!.score);
    }
    for (const r of risks) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});

describe("recoverable value", () => {
  const summary = computeRecoverable(snapshot);

  it("weights outstanding balances by recovery likelihood", () => {
    expect(summary.totalOutstanding).toBe(5000); // 3500 + 1500 overdue
    expect(summary.totalExpectedRecoverable).toBeLessThan(summary.totalOutstanding);
    expect(summary.totalExpectedRecoverable).toBeGreaterThan(0);
  });

  it("assigns dense ranks and never expects more than is owed", () => {
    summary.items.forEach((item, i) => {
      expect(item.rank).toBe(i + 1);
      expect(item.expectedRecoverable).toBeLessThanOrEqual(item.amountDue);
    });
  });
});

describe("churn signals", () => {
  const churn = new Map(computeChurnSignals(snapshot).map((c) => [c.contactId, c]));

  it("flags the lapsed customer as high churn risk", () => {
    const lucy = churn.get("contact-lapsed")!;
    expect(lucy.lapsed).toBe(true);
    expect(lucy.band).toBe("high");
    expect(lucy.signals.join(" ")).toMatch(/lapsed/);
  });

  it("keeps the healthy repeat customer at low churn risk", () => {
    const rita = churn.get("contact-reliable")!;
    expect(rita.lapsed).toBe(false);
    expect(rita.band).toBe("low");
  });

  it("surfaces worsening-payment as a churn signal for the chronic payer", () => {
    const chris = churn.get("contact-chronic")!;
    expect(chris.worseningPayment).toBe(true);
  });
});

describe("aggregate report", () => {
  it("produces every derivation from one snapshot", () => {
    const report = buildReceivablesReport(snapshot);
    expect(report.asOf).toBe(AS_OF);
    expect(report.paymentPatterns.length).toBeGreaterThan(0);
    expect(report.orderCadence.length).toBeGreaterThan(0);
    expect(report.slipRisk.length).toBeGreaterThan(0);
    expect(report.recoverable.items.length).toBe(report.slipRisk.length);
    expect(report.churn.length).toBeGreaterThan(0);
  });
});
