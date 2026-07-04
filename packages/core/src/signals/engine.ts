import { buildReceivablesReport } from "../analysis/report.js";
import type { CompanyContext } from "../domain/company.js";
import { anomalySignals } from "./anomaly.js";
import { cashRecoverySignals } from "./cash-recovery.js";
import { cashflowTimingSignals } from "./cashflow-timing.js";
import { revenueGrowthSignals } from "./revenue-growth.js";
import { strategicSignals } from "./strategic.js";
import {
  SEVERITY_RANK,
  type EnrichedSnapshot,
  type Signal,
  type SignalCategory,
  type SignalInputs,
} from "./types.js";

export interface SignalRunResult {
  asOf: string;
  signals: Signal[];
  countsByCategory: Record<SignalCategory, number>;
  countsBySeverity: Record<string, number>;
}

/**
 * Run every detector over one enriched snapshot and return a prioritised,
 * deduplicated signal list — the agent layer's raw material.
 */
export function runSignalEngine(snapshot: EnrichedSnapshot): SignalRunResult {
  const report = buildReceivablesReport(snapshot);
  const contextByContact = new Map<string, CompanyContext>(
    (snapshot.companyContexts ?? []).map((c) => [c.contactId, c]),
  );
  const inputs: SignalInputs = { snapshot, report, contextByContact };

  const all: Signal[] = [
    ...cashRecoverySignals(inputs),
    ...revenueGrowthSignals(inputs),
    ...cashflowTimingSignals(inputs),
    ...strategicSignals(inputs),
    ...anomalySignals(inputs),
  ];

  // Dedupe: one signal per (invoice, category) — keep the most severe. Signals
  // without an invoiceId are always kept (already unique by id).
  const byInvoice = new Map<string, Signal>();
  const keep: Signal[] = [];
  for (const s of all) {
    if (!s.invoiceId || s.category !== "cash-recovery") {
      keep.push(s);
      continue;
    }
    const key = s.invoiceId;
    const existing = byInvoice.get(key);
    if (!existing || moreImportant(s, existing)) byInvoice.set(key, s);
  }
  keep.push(...byInvoice.values());

  const signals = keep.sort((a, b) => moreImportant(a, b) ? -1 : 1);

  const countsByCategory = {
    "cash-recovery": 0,
    "revenue-growth": 0,
    "cashflow-timing": 0,
    strategic: 0,
    anomaly: 0,
  } as Record<SignalCategory, number>;
  const countsBySeverity: Record<string, number> = {};
  for (const s of signals) {
    countsByCategory[s.category] += 1;
    countsBySeverity[s.severity] = (countsBySeverity[s.severity] ?? 0) + 1;
  }

  return { asOf: snapshot.asOf, signals, countsByCategory, countsBySeverity };
}

function moreImportant(a: Signal, b: Signal): boolean {
  const dr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (dr !== 0) return dr > 0;
  return a.score > b.score;
}
