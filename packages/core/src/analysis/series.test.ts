import { describe, expect, it } from "vitest";
import { makeDemoSnapshot } from "../testing/demo-data.js";
import { buildReceivablesReport } from "./report.js";
import { buildContactMetrics, buildContactSeries } from "./series.js";

const snapshot = makeDemoSnapshot();

describe("contact series builders", () => {
  it("builds a chronological lateness series for the chronic payer", () => {
    const series = buildContactSeries(snapshot, "contact-chronic");
    const lateness = series.find((s) => s.id === "payment-lateness")!;
    expect(lateness.kind).toBe("bar");
    expect(lateness.baseline).toBe(0);
    expect(lateness.points).toHaveLength(5); // five settled invoices
    // Chronologically increasing lateness (10 → 38 days)
    const values = lateness.points.map((p) => p.value);
    expect(values[0]).toBe(10);
    expect(values.at(-1)).toBe(38);
    for (let i = 1; i < lateness.points.length; i++) {
      expect(lateness.points[i]!.date >= lateness.points[i - 1]!.date).toBe(true);
    }
  });

  it("includes negative values (early payment) with a zero baseline", () => {
    const lateness = buildContactSeries(snapshot, "contact-reliable").find(
      (s) => s.id === "payment-lateness",
    )!;
    expect(lateness.points.every((p) => p.value === -2)).toBe(true);
  });

  it("order-values series excludes drafts and voided invoices", () => {
    const withDraft = makeDemoSnapshot();
    withDraft.invoices.push({
      invoiceId: "d1",
      contactId: "contact-reliable",
      status: "DRAFT",
      issueDate: "2026-07-01",
      dueDate: "2026-07-21",
      total: 9999,
      amountDue: 9999,
      amountPaid: 0,
      lineItems: [],
    });
    const orders = buildContactSeries(withDraft, "contact-reliable").find(
      (s) => s.id === "order-values",
    )!;
    expect(orders.points.some((p) => p.value === 9999)).toBe(false);
  });

  it("returns empty series for unknown contacts", () => {
    expect(buildContactSeries(snapshot, "nope")).toHaveLength(0);
  });
});

describe("contact key metrics", () => {
  const report = buildReceivablesReport(snapshot);

  it("summarises the chronic payer with bad tones and outstanding balance", () => {
    const metrics = buildContactMetrics(report, "contact-chronic");
    const byLabel = new Map(metrics.map((m) => [m.label, m]));
    expect(byLabel.get("Avg days late")!.tone).toBe("bad"); // worsening
    expect(byLabel.get("Overdue balance")!.value).toBe("5000");
  });

  it("summarises the reliable payer with good tones and no overdue metric", () => {
    const metrics = buildContactMetrics(report, "contact-reliable");
    const byLabel = new Map(metrics.map((m) => [m.label, m]));
    expect(byLabel.get("Avg days late")!.tone).toBe("good");
    expect(byLabel.has("Overdue balance")).toBe(false);
  });
});
