import Anthropic from "@anthropic-ai/sdk";
import type {
  CompanyContext,
  RecommendedAction,
  Signal,
  SignalRunResult,
} from "@signal/core";
import type { SignalsService } from "./signals.service.js";

/**
 * The decision layer. Takes the full picture — prioritised signals plus each
 * company's context document (Companies House flags, filings, news) — and
 * decides what to do about each signal, with explicit reasoning.
 *
 * With ANTHROPIC_API_KEY set, Claude makes the calls (it can weigh nuances the
 * rules can't: e.g. soften a chase because the customer just had bad press, or
 * bump an upsell because funding landed). Offline, a deterministic policy maps
 * severity → decision so the endpoint (and tests) always work.
 */

export type AgentDecisionKind = "act-now" | "schedule" | "monitor" | "dismiss";

export interface AgentDecision {
  signalId: string;
  signalTitle: string;
  decision: AgentDecisionKind;
  priority: number; // 1 = first
  reasoning: string;
  action: RecommendedAction;
  decidedBy: "claude" | "rules";
}

export interface AgentRunResult {
  asOf: string;
  decisions: AgentDecision[];
  decidedBy: "claude" | "rules";
}

export class AgentService {
  private client?: Anthropic;

  constructor(
    private readonly signals: SignalsService,
    apiKey: string,
    private readonly model: string,
  ) {
    if (apiKey) this.client = new Anthropic({ apiKey });
  }

  async decide(): Promise<AgentRunResult> {
    const run = await this.signals.run();
    const contexts = await this.signals.getContexts();

    if (this.client) {
      try {
        return await this.decideWithClaude(run, contexts);
      } catch {
        // fall through to rules on any model/parsing failure
      }
    }
    return this.decideWithRules(run);
  }

  // ---- Claude path ----

  private async decideWithClaude(
    run: SignalRunResult,
    contexts: CompanyContext[],
  ): Promise<AgentRunResult> {
    const contextByContact = new Map(contexts.map((c) => [c.contactId, c]));
    const payload = {
      asOf: run.asOf,
      signals: run.signals.map((s) => ({
        id: s.id,
        category: s.category,
        type: s.type,
        severity: s.severity,
        score: s.score,
        title: s.title,
        reasoning: s.reasoning,
        recommendedAction: s.recommendedAction,
        companyContext: s.contactId ? summariseContext(contextByContact.get(s.contactId)) : undefined,
      })),
    };

    const message = await this.client!.messages.create({
      model: this.model,
      max_tokens: 4000,
      system:
        "You are the operations agent for a small business's finance stack. You receive detected " +
        "signals (cash recovery, revenue growth, cashflow timing, strategic, anomaly) each with a " +
        "recommended action, plus company intelligence (Companies House flags, filings, news). " +
        "Decide for each signal: act-now, schedule, monitor, or dismiss. Adjust for context — e.g. " +
        "collect urgently from distressed companies before offering terms; never suggest payment " +
        "plans for them; time upsells to good news; keep soft tones for reliable payers. " +
        'Return ONLY a JSON array: [{"signalId","decision","priority","reasoning"}], priority 1 = first.',
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(text) as {
      signalId: string;
      decision: AgentDecisionKind;
      priority: number;
      reasoning: string;
    }[];

    const byId = new Map(run.signals.map((s) => [s.id, s]));
    const decisions: AgentDecision[] = [];
    for (const d of parsed) {
      const signal = byId.get(d.signalId);
      if (!signal) continue;
      decisions.push({
        signalId: d.signalId,
        signalTitle: signal.title,
        decision: d.decision,
        priority: d.priority,
        reasoning: d.reasoning,
        action: signal.recommendedAction,
        decidedBy: "claude",
      });
    }
    if (decisions.length === 0) throw new Error("Claude returned no matching decisions");
    decisions.sort((a, b) => a.priority - b.priority);
    return { asOf: run.asOf, decisions, decidedBy: "claude" };
  }

  // ---- Deterministic fallback ----

  private decideWithRules(run: SignalRunResult): AgentRunResult {
    const decisions = run.signals.map((s, i): AgentDecision => {
      const decision = ruleFor(s);
      return {
        signalId: s.id,
        signalTitle: s.title,
        decision,
        priority: i + 1, // engine order is already severity-then-score
        reasoning: `${s.reasoning.join(". ")}. Policy: ${s.severity} ${s.category} → ${decision}.`,
        action: s.recommendedAction,
        decidedBy: "rules",
      };
    });
    return { asOf: run.asOf, decisions, decidedBy: "rules" };
  }
}

function ruleFor(s: Signal): AgentDecisionKind {
  if (s.severity === "urgent") return "act-now";
  if (s.severity === "high") return "act-now";
  if (s.severity === "medium") return s.category === "cash-recovery" ? "act-now" : "schedule";
  return "monitor";
}

function summariseContext(ctx: CompanyContext | undefined) {
  if (!ctx) return undefined;
  return {
    companyName: ctx.companyName,
    role: ctx.role,
    chStatus: ctx.companiesHouse?.status,
    chFlags: ctx.companiesHouse?.flags ?? [],
    recentFilings: ctx.companiesHouse?.filings.slice(0, 3).map((f) => `${f.date} ${f.description}`),
    news: ctx.news.slice(0, 3).map((n) => `[${n.sentiment}] ${n.title} (${n.source})`),
  };
}
