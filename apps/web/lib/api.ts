import type {
  ChurnSignal,
  CompanyContext,
  Contact,
  EvidenceLink,
  KeyMetric,
  MetricSeries,
  OrderCadence,
  PaymentPattern,
  ReceivablesReport,
  RecommendedAction,
  RecoverableSummary,
  Severity,
  SignalCategory,
  SignalRunResult,
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
  if (!res.ok) {
    // Surface structured API errors (e.g. 409 StaleProposal) to the UI.
    let detail = "";
    try {
      const err = (await res.json()) as { error?: string; message?: string };
      detail = [err.error, err.message].filter(Boolean).join(": ");
    } catch {
      // non-JSON error body
    }
    throw new Error(detail || `POST ${path} → ${res.status}`);
  }
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
  generatedBy: "gemini" | "template";
}

export interface AgentDecision {
  signalId: string;
  signalTitle: string;
  decision: "act-now" | "schedule" | "monitor" | "dismiss";
  priority: number;
  reasoning: string;
  action: { kind: string; [k: string]: unknown };
  decidedBy: "gemini" | "rules";
}

export interface AgentRunResult {
  asOf: string;
  decisions: AgentDecision[];
  decidedBy: "gemini" | "rules";
}

export interface CreateQuoteResult {
  quoteId: string;
  deepLink?: string;
}

// ---- Plan stage ----

export type ProposalStatus = "proposed" | "approved" | "executed" | "rejected" | "failed" | "superseded";

export interface ActionProposal {
  id: string;
  signalId: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  snapshotAsOf: string;
  autoExecuted?: boolean;
  title: string;
  category: SignalCategory;
  severity: Severity;
  impact?: number;
  autonomyTier: "auto" | "approve";
  steps: string[];
  contactId?: string;
  contactName?: string;
  invoiceId?: string;
  action: RecommendedAction;
  prepared?: { contactId: string; reference?: string; summary?: string; lineItems: { description: string; quantity: number; unitAmount: number; lineAmount: number }[] };
  reasoning: {
    decision: "act-now" | "schedule" | "monitor" | "dismiss";
    decisionReasoning: string;
    decidedBy: "gemini" | "rules";
    priority: number;
    signalReasoning: string[];
    evidence: EvidenceLink[];
  };
  inputs: { series: MetricSeries[]; metrics: KeyMetric[] };
  result?: { executedAt: string; xeroId?: string; deepLink?: string; emailDraft?: ChaseEmailDraft; note?: string };
  failure?: { failedAt: string; message: string };
  resolution?: { at: string; note?: string };
  verification?: { verdict: "confirmed" | "needs-review"; note: string; verifiedBy: "gemini"; at: string };
}

// ---- Sources & briefs ----

export interface SourceItem {
  type: "news" | "gazette" | "filing";
  date: string;
  title: string;
  url?: string;
  source: string;
  sentiment?: "positive" | "negative" | "neutral";
  contactId: string;
  companyName: string;
}

export interface CompanyBrief {
  context: CompanyContext;
  metrics: KeyMetric[];
  series: MetricSeries[];
  signals: import("@signal/core").Signal[];
  proposals: ActionProposal[];
  evidence: SourceItem[];
  brief: string;
  briefBy: "rules" | "gemini";
}

export interface ImpactSummary {
  actionsExecuted: number;
  emailsDrafted: number;
  quotesCreated: number;
  cashRecovered: number;
  pipelineCreated: number;
  savingsCaptured: number;
  totalUnlocked: number;
  stages: { found: number; inMotion: number; landed: number };
}

export interface AskResult {
  answer: string;
  answeredBy: "gemini" | "offline";
}

export interface GenerateProposalsResult {
  created: number;
  updated: number;
  unchanged: number;
  superseded: number;
  autoExecuted: number;
}

export const api = {
  impact: () => get<ImpactSummary>("/api/impact"),
  ask: (question: string) => post<AskResult>("/api/ask", { question }),
  sources: () => get<SourceItem[]>("/api/sources"),
  companyBrief: (contactId: string) =>
    get<CompanyBrief>(`/api/companies/${encodeURIComponent(contactId)}/brief`),
  proposals: () => get<ActionProposal[]>("/api/proposals"),
  generateProposals: () => post<GenerateProposalsResult>("/api/proposals/generate", {}),
  approveProposal: (id: string, force = false) =>
    post<ActionProposal>(`/api/proposals/${encodeURIComponent(id)}/approve${force ? "?force=true" : ""}`, {}),
  rejectProposal: (id: string, note?: string) =>
    post<ActionProposal>(`/api/proposals/${encodeURIComponent(id)}/reject`, { note }),
  createQuote: (quote: ReactivationProposal["quote"]) =>
    post<CreateQuoteResult>("/api/actions/quotes", quote),
  signals: () => get<SignalRunResult>("/api/signals"),
  contexts: () => get<CompanyContext[]>("/api/context"),
  context: (contactId: string) => get<CompanyContext>(`/api/context/${contactId}`),
  confirmCompanyNumber: async (contactId: string, companyNumber: string) => {
    const res = await fetch(`${BASE}/api/context/${encodeURIComponent(contactId)}/company-number`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyNumber }),
    });
    if (!res.ok) throw new Error(`Confirm failed (${res.status})`);
    return (await res.json()) as CompanyContext;
  },
  agentDecide: () => post<AgentRunResult>("/api/agent/decide", {}),
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
