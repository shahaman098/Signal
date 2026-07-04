import type {
  ChurnSignal,
  Contact,
  OrderCadence,
  PaymentPattern,
  ReceivablesReport,
  RecoverableSummary,
  SlipRisk,
} from "@signal/core";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export interface ReactivationProposal {
  contactId: string;
  contactName: string;
  churnScore: number;
  rationale: string[];
  quote: { contactId: string; reference?: string; summary?: string; lineItems: unknown[] };
}

export interface ChaseEmailDraft {
  subject: string;
  body: string;
  generatedBy: "claude" | "template";
}

export const api = {
  report: () => get<ReceivablesReport>("/api/analytics/report"),
  contacts: () => get<Contact[]>("/api/analytics/contacts"),
  slipRisk: () => get<SlipRisk[]>("/api/analytics/slip-risk"),
  recoverable: () => get<RecoverableSummary>("/api/analytics/recoverable"),
  churn: () => get<ChurnSignal[]>("/api/analytics/churn"),
  paymentPatterns: () => get<PaymentPattern[]>("/api/analytics/payment-patterns"),
  orderCadence: () => get<OrderCadence[]>("/api/analytics/order-cadence"),
  reactivationProposals: () =>
    get<ReactivationProposal[]>("/api/actions/reactivation-proposals"),
  draftChaseEmail: (invoiceId: string, tone: "friendly" | "firm" = "friendly") =>
    post<ChaseEmailDraft>(`/api/actions/invoices/${invoiceId}/chase-email`, { tone }),
};
