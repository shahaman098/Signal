import type { XeroSnapshot } from "../domain/types.js";
import type { CompanyContext } from "../domain/company.js";
import type { ReceivablesReport } from "../analysis/report.js";

/**
 * The signal taxonomy. Every detector emits Signal objects — a uniform shape
 * the agent layer can reason over: what happened, why we think so (reasoning +
 * evidence links), and what we recommend doing about it.
 */

export type SignalCategory =
  | "cash-recovery"
  | "revenue-growth"
  | "cashflow-timing"
  | "strategic"
  | "anomaly";

export type SignalType =
  // Cash recovery (money owed to you)
  | "overdue-chase"
  | "slip-risk-escalation"
  | "distress-collection"
  | "partial-payment-followup"
  | "chronic-payer-soft-nudge"
  // Revenue growth (money on the table)
  | "recurring-conversion"
  | "reactivation-offer"
  | "shrinking-basket-winback"
  | "cross-sell"
  | "good-news-upsell"
  // Cash flow timing (money out)
  | "bills-vs-receivables"
  | "early-payment-discount"
  | "supplier-distress"
  // Strategic / portfolio
  | "concentration-risk"
  | "margin-drift"
  | "churn-cohort-match"
  // Anomaly / hygiene
  | "duplicate-invoice"
  | "amount-anomaly"
  | "terms-change";

export type Severity = "info" | "medium" | "high" | "urgent";

export type ChaseTone = "soft" | "friendly" | "firm" | "urgent";

/** What the signal recommends. The agent decides whether/when to act. */
export type RecommendedAction =
  | { kind: "chase-email"; invoiceId: string; tone: ChaseTone; note?: string }
  | { kind: "create-quote"; contactId: string; rationale: string }
  | { kind: "convert-recurring"; contactId: string; itemCode?: string }
  | { kind: "suggest-upfront-terms"; contactId: string }
  | { kind: "defer-bill"; billId: string }
  | { kind: "pay-bill-early"; billId: string; saving: number }
  | { kind: "flag-review"; note: string };

export interface EvidenceLink {
  label: string;
  url?: string;
}

export interface Signal {
  /** Stable id: `${type}:${primary entity id}` — lets the agent dedupe across runs. */
  id: string;
  category: SignalCategory;
  type: SignalType;
  severity: Severity;
  /** 0–1 priority within its severity band. */
  score: number;
  title: string;
  contactId?: string;
  invoiceId?: string;
  billId?: string;
  /** Human-readable reasoning chain — why this signal fired. */
  reasoning: string[];
  /** Source links: CH filings (PDF), news articles, Xero objects. */
  evidence: EvidenceLink[];
  recommendedAction: RecommendedAction;
}

/** Everything detectors see: Xero data + per-company intelligence + derived analysis. */
export interface EnrichedSnapshot extends XeroSnapshot {
  companyContexts?: CompanyContext[];
}

export interface SignalInputs {
  snapshot: EnrichedSnapshot;
  report: ReceivablesReport;
  contextByContact: Map<string, CompanyContext>;
}

export const SEVERITY_RANK: Record<Severity, number> = {
  urgent: 3,
  high: 2,
  medium: 1,
  info: 0,
};
