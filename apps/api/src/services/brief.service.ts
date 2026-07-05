import {
  buildContactMetrics,
  buildContactSeries,
  buildReceivablesReport,
  type CompanyContext,
  type KeyMetric,
  type MetricSeries,
  type Signal,
} from "@signal/core";
import type { AnalyticsService } from "./analytics.service.js";
import type { GeminiClient } from "../llm/gemini.js";
import type { SignalsService } from "./signals.service.js";
import type { ActionProposal } from "./proposal.service.js";
import type { ProposalStore } from "./proposal-store.js";

/** One evidence item in the unified sources feed. */
export interface SourceItem {
  type: "news" | "gazette" | "filing";
  date: string;
  title: string;
  url?: string;
  source: string; // publication / "The Gazette" / "Companies House"
  sentiment?: "positive" | "negative" | "neutral";
  contactId: string;
  companyName: string;
}

/** The per-company dossier: everything we know, and a written brief from it. */
export interface CompanyBrief {
  context: CompanyContext;
  metrics: KeyMetric[];
  series: MetricSeries[];
  signals: Signal[];
  proposals: ActionProposal[];
  evidence: SourceItem[];
  /** One-paragraph brief composed from the data (Gemini-polished when enabled). */
  brief: string;
  briefBy: "rules" | "gemini";
}

export class BriefService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly signals: SignalsService,
    private readonly proposalStore: ProposalStore,
    private readonly llm: GeminiClient,
  ) {}

  /** Unified, date-sorted evidence feed across every counterparty. */
  async sources(): Promise<SourceItem[]> {
    const contexts = await this.signals.getContexts();
    const items: SourceItem[] = [];
    for (const ctx of contexts) {
      items.push(...evidenceFor(ctx));
    }
    return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200);
  }

  async brief(contactId: string): Promise<CompanyBrief | null> {
    const [snapshot, contexts, run, allProposals] = await Promise.all([
      this.analytics.getSnapshot(),
      this.signals.getContexts(),
      this.signals.run(),
      this.proposalStore.loadAll(),
    ]);
    const context = contexts.find((c) => c.contactId === contactId);
    if (!context) return null;

    const report = buildReceivablesReport(snapshot);
    const metrics = buildContactMetrics(report, contactId);
    const series = buildContactSeries(snapshot, contactId);
    const signals = run.signals.filter((s) => s.contactId === contactId);
    const proposals = allProposals
      .filter((p) => p.contactId === contactId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 10);
    const evidence = evidenceFor(context).sort((a, b) => (a.date < b.date ? 1 : -1));

    const rulesBrief = composeBrief(context, metrics, signals, report, contactId);
    let brief = rulesBrief;
    let briefBy: CompanyBrief["briefBy"] = "rules";

    if (this.llm.enabled) {
      const polished = await this.llm.complete({
        system:
          "You are a credit analyst. Rewrite the following data points into one crisp, factual " +
          "briefing paragraph (max 90 words) for a business owner. No invented facts — only " +
          "what is given. Plain text, no markdown.",
        prompt: rulesBrief,
        maxTokens: 300,
      });
      if (polished) {
        brief = polished.trim();
        briefBy = "gemini";
      }
    }

    return { context, metrics, series, signals, proposals, evidence, brief, briefBy };
  }
}

// ---- helpers ----

function evidenceFor(ctx: CompanyContext): SourceItem[] {
  const items: SourceItem[] = [];
  for (const n of ctx.news ?? []) {
    items.push({
      type: "news",
      date: n.date,
      title: n.title,
      url: n.url,
      source: n.source,
      sentiment: n.sentiment,
      contactId: ctx.contactId,
      companyName: ctx.companyName,
    });
  }
  for (const g of ctx.gazetteNotices ?? []) {
    items.push({
      type: "gazette",
      date: g.date,
      title: g.title,
      url: g.url,
      source: "The Gazette",
      sentiment: "negative",
      contactId: ctx.contactId,
      companyName: ctx.companyName,
    });
  }
  for (const f of ctx.companiesHouse?.filings ?? []) {
    items.push({
      type: "filing",
      date: f.date,
      title: f.description,
      url: f.pdfUrl ?? ctx.companiesHouse?.profileUrl,
      source: "Companies House",
      contactId: ctx.contactId,
      companyName: ctx.companyName,
    });
  }
  return items;
}

/** Deterministic briefing paragraph, composed strictly from computed data. */
function composeBrief(
  ctx: CompanyContext,
  metrics: KeyMetric[],
  signals: Signal[],
  report: ReturnType<typeof buildReceivablesReport>,
  contactId: string,
): string {
  const parts: string[] = [];
  parts.push(`${ctx.companyName} (${ctx.role}).`);

  const pattern = report.paymentPatterns.find((p) => p.contactId === contactId);
  if (pattern && pattern.sampleSize > 0) {
    parts.push(
      `Settled ${pattern.sampleSize} invoice${pattern.sampleSize === 1 ? "" : "s"}, averaging ${pattern.avgDaysLate}d ${pattern.avgDaysLate >= 0 ? "late" : "early"} (±${pattern.stdDaysLate}d, trend ${pattern.trend}).`,
    );
  }

  const cadence = report.orderCadence.find((c) => c.contactId === contactId);
  if (cadence && cadence.orderCount > 0) {
    parts.push(
      `Orders roughly every ${Math.round(cadence.frequencyDays) || "—"}d; last one ${cadence.recencyDays}d ago (${cadence.segment}).`,
    );
  }

  const outstanding = report.slipRisk
    .filter((r) => r.contactId === contactId)
    .reduce((s, r) => s + r.amountDue, 0);
  if (outstanding > 0) parts.push(`Overdue balance: ${Math.round(outstanding)}.`);

  const churn = report.churn.find((c) => c.contactId === contactId);
  if (churn) parts.push(`Churn score ${churn.score} (${churn.band}).`);

  const flags = ctx.companiesHouse?.flags ?? [];
  if (flags.length > 0) parts.push(`⚠ Companies House flags: ${flags.join(", ")}.`);
  const gazette = ctx.gazetteNotices?.length ?? 0;
  if (gazette > 0) parts.push(`${gazette} official Gazette notice${gazette === 1 ? "" : "s"} on record.`);
  const negNews = (ctx.news ?? []).find((n) => n.sentiment === "negative");
  const posNews = (ctx.news ?? []).find((n) => n.sentiment === "positive");
  if (negNews) parts.push(`Negative press: "${negNews.title}".`);
  if (posNews) parts.push(`Positive news: "${posNews.title}".`);

  const urgent = signals.filter((s) => s.severity === "urgent" || s.severity === "high");
  if (urgent.length > 0) {
    parts.push(`Active signals: ${urgent.map((s) => s.type).join(", ")}.`);
  } else if (signals.length === 0) {
    parts.push("No active signals.");
  }

  return parts.join(" ");
}
