import {
  buildContactMetrics,
  buildContactSeries,
  buildReceivablesReport,
  SEVERITY_RANK,
  type CompanyContext,
  type CreateQuoteInput,
  type EvidenceLink,
  type KeyMetric,
  type MetricSeries,
  type ReceivablesReport,
  type RecommendedAction,
  type Severity,
  type Signal,
  type SignalCategory,
  type XeroSnapshot,
} from "@signal/core";
import type { AgentDecisionKind, AgentService } from "./agent.service.js";
import type { AnalyticsService } from "./analytics.service.js";
import type { ActionsService } from "./actions.service.js";
import type { ChaseEmailDraft } from "../llm/chase-email.js";
import type { GeminiClient } from "../llm/gemini.js";
import type { SignalsService } from "./signals.service.js";
import type { ProposalStore } from "./proposal-store.js";

/**
 * The Plan stage. A proposal is a frozen, reviewable artifact: the signal, the
 * agent's decision, the full reasoning chain, the input data that produced it
 * (metrics + chart series + evidence links: Companies House filings, Gazette
 * notices, news), and the concrete action payload the human is approving.
 *
 * Policy (user-chosen): zero-risk DRAFTS auto-execute at generation time
 * (chase-email drafts — nothing customer-visible happens); quotes and anything
 * that writes a customer-facing object wait for explicit approval.
 */

export type ProposalStatus =
  | "proposed"
  | "approved"
  | "executed"
  | "rejected"
  | "failed"
  | "superseded";

export interface ActionProposal {
  id: string; // signalId, or `${signalId}@n` for post-terminal regenerations
  signalId: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  snapshotAsOf: string;
  signalFingerprint: string;
  autoExecuted?: boolean;

  title: string;
  category: SignalCategory;
  severity: Severity;
  /** Estimated money at stake (recoverable balance / order value / saving). */
  impact?: number;
  /** Autonomy tier: "auto" = low-stakes, executed at generation; "approve" = held for one tap. */
  autonomyTier: "auto" | "approve";
  /** The step-by-step plan shown before the action runs. */
  steps: string[];
  contactId?: string;
  contactName?: string;
  invoiceId?: string;
  billId?: string;

  action: RecommendedAction;
  /** Concrete payload baked at generation — the human approves exactly this. */
  prepared?: CreateQuoteInput;

  reasoning: {
    decision: AgentDecisionKind;
    decisionReasoning: string;
    decidedBy: "gemini" | "rules";
    priority: number;
    signalReasoning: string[];
    evidence: EvidenceLink[];
  };
  inputs: {
    series: MetricSeries[];
    metrics: KeyMetric[];
  };

  result?: {
    executedAt: string;
    xeroId?: string;
    deepLink?: string;
    emailDraft?: ChaseEmailDraft;
    note?: string;
    /** Invoice balance when a chase executed — lets /api/impact measure what was recovered since. */
    amountDueAtExecution?: number;
  };
  failure?: { failedAt: string; message: string };
  resolution?: { at: string; note?: string };
  /**
   * AI confirmation: the LLM cross-checks the computed metrics against the
   * raw underlying figures and flags contradictions before a human reviews.
   * Absent when running offline.
   */
  verification?: {
    verdict: "confirmed" | "needs-review";
    note: string;
    verifiedBy: "gemini";
    at: string;
  };
}

export interface GenerateResult {
  created: number;
  updated: number;
  unchanged: number;
  superseded: number;
  autoExecuted: number;
}

export class ProposalConflictError extends Error {
  constructor(
    public readonly code: "InvalidState" | "StaleProposal" | "Conflict",
    message: string,
  ) {
    super(message);
  }
}

export class ProposalService {
  private inflight = new Set<string>();

  constructor(
    private readonly agent: AgentService,
    private readonly signals: SignalsService,
    private readonly analytics: AnalyticsService,
    private readonly actions: ActionsService,
    private readonly store: ProposalStore,
    private readonly llm: GeminiClient,
  ) {}

  async list(): Promise<ActionProposal[]> {
    const all = await this.store.loadAll();
    return all.sort((a, b) => {
      const aLive = a.status === "proposed" ? 0 : 1;
      const bLive = b.status === "proposed" ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      if (aLive === 0) {
        // Pending queue ranks by impact: severity → money at stake → priority.
        const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
        if (sev !== 0) return sev;
        const impact = (b.impact ?? 0) - (a.impact ?? 0);
        if (impact !== 0) return impact;
        return a.reasoning.priority - b.reasoning.priority;
      }
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
  }

  /** Build/refresh proposals from the current signals + agent decisions. */
  async generate(): Promise<GenerateResult> {
    const [agentRun, run, snapshot, contexts] = await Promise.all([
      this.agent.decide(),
      this.signals.run(),
      this.analytics.getSnapshot(),
      this.signals.getContexts(),
    ]);
    const decisions = agentRun.decisions;
    const report = buildReceivablesReport(snapshot);
    const signalById = new Map(run.signals.map((s) => [s.id, s]));
    const contextByContact = new Map(contexts.map((c) => [c.contactId, c]));
    const contactName = new Map(snapshot.contacts.map((c) => [c.contactId, c.name]));
    const existing = await this.store.loadAll();
    const byBase = groupByBase(existing);

    const result: GenerateResult = { created: 0, updated: 0, unchanged: 0, superseded: 0, autoExecuted: 0 };
    const now = new Date().toISOString();

    // Actionable decisions only — monitor/dismiss stay dashboard-only.
    const actionable = decisions.filter((d) => d.decision === "act-now" || d.decision === "schedule");

    for (const decision of actionable) {
      const signal = signalById.get(decision.signalId);
      if (!signal) continue;
      const fingerprint = fingerprintOf(signal);
      const versions = byBase.get(signal.id) ?? [];
      const latest = versions.at(-1);

      if (latest && latest.status === "proposed") {
        if (latest.signalFingerprint === fingerprint) {
          latest.updatedAt = now;
          latest.snapshotAsOf = run.asOf;
          await this.store.save(latest);
          result.unchanged += 1;
          continue;
        }
        // Signal changed while pending — update the payload in place.
        const refreshed = this.build(latest.id, signal, decision, fingerprint, run.asOf, snapshot, report, contextByContact, contactName, now, latest.createdAt);
        await this.store.save(refreshed);
        result.updated += 1;
        continue;
      }

      if (latest && latest.signalFingerprint === fingerprint) {
        // Terminal with identical content — nothing new to review.
        result.unchanged += 1;
        continue;
      }

      // New proposal (fresh signal, or changed after a terminal outcome).
      const id = latest ? `${signal.id}@${versions.length + 1}` : signal.id;
      const proposal = this.build(id, signal, decision, fingerprint, run.asOf, snapshot, report, contextByContact, contactName, now, now);

      // Auto-execute policy: drafts only. A chase email is a draft (sent by a
      // human, outside Xero) — safe to prepare immediately.
      if (proposal.action.kind === "chase-email") {
        await this.executeInto(proposal, true);
        result.autoExecuted += 1;
      }

      await this.store.save(proposal);
      result.created += 1;
    }

    // Supersede pending proposals whose signal disappeared from this run.
    const actionableIds = new Set(actionable.map((d) => d.signalId));
    for (const p of existing) {
      if (p.status !== "proposed") continue;
      if (actionableIds.has(p.signalId)) continue;
      p.status = "superseded";
      p.resolution = { at: now, note: `Signal no longer present as of ${run.asOf}` };
      p.updatedAt = now;
      await this.store.save(p);
      result.superseded += 1;
    }

    // AI confirmation pass: the LLM sanity-checks the computed numbers behind
    // each pending proposal against the raw series before a human reviews.
    await this.verifyProposals();

    return result;
  }

  /**
   * Batched LLM cross-check of pending proposals. The model sees the derived
   * metrics AND the raw per-invoice series they were computed from, and flags
   * proposals where the numbers don't support the recommendation.
   */
  private async verifyProposals(): Promise<void> {
    if (!this.llm.enabled) return;
    const pending = (await this.store.loadAll()).filter(
      (p) => p.status === "proposed" && !p.verification,
    );
    if (pending.length === 0) return;

    const batch = pending.slice(0, 20).map((p) => ({
      id: p.id,
      title: p.title,
      action: p.action,
      signalReasoning: p.reasoning.signalReasoning,
      metrics: p.inputs.metrics,
      rawSeries: p.inputs.series.map((s) => ({
        what: s.title,
        points: s.points.map((pt) => ({ date: pt.date, value: pt.value })),
      })),
    }));

    const text = await this.llm.complete({
      system:
        "You are a data auditor for a finance tool. For each proposal you receive the DERIVED " +
        "claims (title, reasoning, metrics) and the RAW underlying series they were computed from. " +
        "Verify the claims against the raw data: do the numbers, trends and directions actually " +
        "support the recommendation? Verdict 'confirmed' when the data supports it; " +
        "'needs-review' when you find a contradiction, an arithmetic inconsistency, or the raw " +
        "series is too thin to support the claim. Keep each note to one sentence.",
      prompt: JSON.stringify({ proposals: batch }),
      maxTokens: 3000,
      jsonSchema: {
        type: "object",
        properties: {
          verifications: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                verdict: { type: "string", enum: ["confirmed", "needs-review"] },
                note: { type: "string" },
              },
              required: ["id", "verdict", "note"],
            },
          },
        },
        required: ["verifications"],
      },
    });
    if (!text) return;

    try {
      const parsed = JSON.parse(text) as {
        verifications: { id: string; verdict: "confirmed" | "needs-review"; note: string }[];
      };
      const at = new Date().toISOString();
      for (const v of parsed.verifications ?? []) {
        const proposal = pending.find((p) => p.id === v.id);
        if (!proposal) continue;
        proposal.verification = { verdict: v.verdict, note: v.note, verifiedBy: "gemini", at };
        proposal.updatedAt = at;
        await this.store.save(proposal);
      }
    } catch {
      // verification is best-effort — never block generation on it
    }
  }

  async approve(id: string, force = false): Promise<ActionProposal> {
    if (this.inflight.has(id)) {
      throw new ProposalConflictError("Conflict", "Approval already in progress");
    }
    this.inflight.add(id);
    try {
      const proposal = await this.store.load(id);
      if (!proposal) throw new ProposalConflictError("InvalidState", `No proposal ${id}`);
      if (proposal.status !== "proposed") {
        throw new ProposalConflictError("InvalidState", `Proposal is ${proposal.status}, not proposed`);
      }

      // Staleness check against live signals (snapshot is cached, cheap).
      const run = await this.signals.run();
      const signal = run.signals.find((s) => s.id === proposal.signalId);
      const now = new Date().toISOString();
      if (!signal) {
        proposal.status = "superseded";
        proposal.resolution = { at: now, note: "Signal no longer present at approval time" };
        proposal.updatedAt = now;
        await this.store.save(proposal);
        throw new ProposalConflictError("StaleProposal", "Underlying signal has resolved — proposal superseded");
      }
      if (!force && fingerprintOf(signal) !== proposal.signalFingerprint) {
        throw new ProposalConflictError(
          "StaleProposal",
          "Signal has changed since this proposal was generated — regenerate or approve with force",
        );
      }

      // Persist approved BEFORE executing so a crash is visible in the store.
      proposal.status = "approved";
      proposal.updatedAt = now;
      await this.store.save(proposal);

      await this.executeInto(proposal, false);
      await this.store.save(proposal);
      return proposal;
    } finally {
      this.inflight.delete(id);
    }
  }

  async reject(id: string, note?: string): Promise<ActionProposal> {
    const proposal = await this.store.load(id);
    if (!proposal) throw new ProposalConflictError("InvalidState", `No proposal ${id}`);
    if (proposal.status !== "proposed") {
      throw new ProposalConflictError("InvalidState", `Proposal is ${proposal.status}, not proposed`);
    }
    const now = new Date().toISOString();
    proposal.status = "rejected";
    proposal.resolution = { at: now, note };
    proposal.updatedAt = now;
    await this.store.save(proposal);
    return proposal;
  }

  // ---- internals ----

  /** Execute the proposal's action, mutating it to executed/failed. */
  private async executeInto(proposal: ActionProposal, auto: boolean): Promise<void> {
    const now = new Date().toISOString();
    try {
      const action = proposal.action;
      switch (action.kind) {
        case "chase-email": {
          const draft = await this.actions.draftChaseEmail(action.invoiceId, {
            tone: action.tone === "firm" || action.tone === "urgent" ? "firm" : "friendly",
          });
          // Record the balance at execution — /api/impact measures recovery
          // as the drop in amountDue after the chase went out.
          const invoice = await this.analytics.findInvoice(action.invoiceId);
          proposal.result = {
            executedAt: now,
            emailDraft: draft,
            note: "Email drafted — send it from your mail client",
            amountDueAtExecution: invoice?.amountDue,
          };
          break;
        }
        case "create-quote":
        case "convert-recurring": {
          if (!proposal.prepared) throw new Error("No prepared quote payload on proposal");
          const res = await this.actions.createQuote(proposal.prepared);
          proposal.result = { executedAt: now, xeroId: res.quoteId, deepLink: res.deepLink };
          break;
        }
        default: {
          // Acknowledge-only actions: the decision itself is the outcome.
          proposal.result = { executedAt: now, note: acknowledgeNote(action) };
        }
      }
      proposal.status = "executed";
      proposal.autoExecuted = auto || undefined;
    } catch (err) {
      proposal.status = "failed";
      proposal.failure = { failedAt: now, message: err instanceof Error ? err.message : String(err) };
    }
    proposal.updatedAt = now;
  }

  private build(
    id: string,
    signal: Signal,
    decision: { decision: AgentDecisionKind; reasoning: string; decidedBy: "gemini" | "rules"; priority: number },
    fingerprint: string,
    asOf: string,
    snapshot: XeroSnapshot,
    report: ReceivablesReport,
    contextByContact: Map<string, CompanyContext>,
    contactName: Map<string, string>,
    now: string,
    createdAt: string,
  ): ActionProposal {
    const ctx = signal.contactId ? contextByContact.get(signal.contactId) : undefined;

    // Evidence = signal evidence ∪ the contact's registry filings, official
    // Gazette notices and recent news — the full "chain of inputs".
    const evidence: EvidenceLink[] = [...signal.evidence];
    if (ctx?.companiesHouse?.profileUrl) {
      evidence.push({ label: `Companies House: ${ctx.companiesHouse.companyName}`, url: ctx.companiesHouse.profileUrl });
    }
    for (const f of ctx?.companiesHouse?.filings?.slice(0, 2) ?? []) {
      if (f.pdfUrl) evidence.push({ label: `Filing: ${f.date} ${f.description.slice(0, 50)}`, url: f.pdfUrl });
    }
    for (const g of ctx?.gazetteNotices?.slice(0, 2) ?? []) {
      evidence.push({ label: `Gazette: ${g.title.slice(0, 60)}`, url: g.url });
    }
    for (const n of ctx?.news?.slice(0, 3) ?? []) {
      evidence.push({ label: `News [${n.sentiment}]: ${n.title.slice(0, 60)}`, url: n.url });
    }
    const seen = new Set<string>();
    const dedupedEvidence = evidence.filter((e) => {
      const key = e.url ?? e.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const prepared = buildPreparedQuote(signal, snapshot);
    return {
      id,
      signalId: signal.id,
      status: "proposed",
      createdAt,
      updatedAt: now,
      snapshotAsOf: asOf,
      signalFingerprint: fingerprint,
      title: signal.title,
      category: signal.category,
      severity: signal.severity,
      impact: signal.impact,
      autonomyTier: tierFor(signal.recommendedAction),
      steps: buildSteps(signal.recommendedAction, prepared),
      contactId: signal.contactId,
      contactName: signal.contactId ? contactName.get(signal.contactId) : undefined,
      invoiceId: signal.invoiceId,
      billId: signal.billId,
      action: signal.recommendedAction,
      prepared,
      reasoning: {
        decision: decision.decision,
        decisionReasoning: decision.reasoning,
        decidedBy: decision.decidedBy,
        priority: decision.priority,
        signalReasoning: signal.reasoning,
        evidence: dedupedEvidence,
      },
      inputs: {
        series: signal.contactId ? buildContactSeries(snapshot, signal.contactId) : [],
        metrics: signal.contactId ? buildContactMetrics(report, signal.contactId) : [],
      },
    };
  }
}

// ---- helpers ----

function fingerprintOf(signal: Signal): string {
  const s = JSON.stringify([signal.severity, signal.score, signal.reasoning, signal.recommendedAction]);
  // djb2 — tiny stable hash, no crypto needed.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function groupByBase(proposals: ActionProposal[]): Map<string, ActionProposal[]> {
  const map = new Map<string, ActionProposal[]>();
  for (const p of proposals) {
    const arr = map.get(p.signalId);
    if (arr) arr.push(p);
    else map.set(p.signalId, [p]);
  }
  for (const arr of map.values()) arr.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return map;
}

/** Bake the concrete quote payload for quote-like actions at generation time. */
function buildPreparedQuote(signal: Signal, snapshot: XeroSnapshot): CreateQuoteInput | undefined {
  const action = signal.recommendedAction;
  if ((action.kind !== "create-quote" && action.kind !== "convert-recurring") || !signal.contactId) {
    return undefined;
  }
  const template = snapshot.invoices
    .filter((i) => i.contactId === signal.contactId && i.lineItems.length > 0 && i.status !== "DRAFT" && i.status !== "VOIDED")
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))[0];
  if (!template) return undefined;

  const rationale = action.kind === "create-quote" ? action.rationale : "Convert to recurring order";
  return {
    contactId: signal.contactId,
    reference: rationale.slice(0, 60),
    summary: rationale,
    lineItems: template.lineItems.map((li) => ({ ...li })),
  };
}

/**
 * Tiered autonomy: drafts (nothing customer-visible, fully reversible) run
 * automatically; anything creating a customer-facing object or moving money
 * is held for one-tap approval.
 */
function tierFor(action: RecommendedAction): "auto" | "approve" {
  return action.kind === "chase-email" ? "auto" : "approve";
}

/** The step-by-step plan a human sees before the action runs. */
function buildSteps(action: RecommendedAction, prepared?: CreateQuoteInput): string[] {
  switch (action.kind) {
    case "chase-email":
      return [
        `Draft a ${action.tone} chase email for the invoice, matched to the customer's payment history`,
        "You review the draft and send it from your own mail client",
        "Recovery is tracked automatically once the balance moves",
      ];
    case "create-quote":
    case "convert-recurring": {
      const total = prepared?.lineItems.reduce((s, li) => s + li.lineAmount, 0);
      return [
        `Create a DRAFT quote in Xero${total ? ` for ${Math.round(total)}` : ""} based on the customer's usual order`,
        "You review it in Xero (deep link provided) and send it when happy",
        "Pipeline value is counted in 'unlocked' once created",
      ];
    }
    case "suggest-upfront-terms":
      return ["Acknowledge and raise upfront/shorter terms in your next conversation with the customer"];
    case "defer-bill":
      return [`Reschedule bill ${action.billId} in your payment run`, "Re-check the 30-day cash position after"];
    case "pay-bill-early":
      return [`Pay bill ${action.billId} before the discount deadline`, `Bank the ${action.saving} saving`];
    case "flag-review":
      return [action.note, "Mark reviewed once checked"];
    default:
      return ["Execute the recommended action"];
  }
}

function acknowledgeNote(action: RecommendedAction): string {
  switch (action.kind) {
    case "suggest-upfront-terms":
      return "Acknowledged — discuss upfront/shorter payment terms with the customer";
    case "defer-bill":
      return `Acknowledged — defer bill ${action.billId} (reschedule the payment run)`;
    case "pay-bill-early":
      return `Acknowledged — pay bill ${action.billId} early to capture the ${action.saving} saving`;
    case "flag-review":
      return `Acknowledged — ${action.note}`;
    default:
      return "Acknowledged";
  }
}
