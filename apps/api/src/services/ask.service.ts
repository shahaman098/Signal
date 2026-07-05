import { buildReceivablesReport, round } from "@signal/core";
import type { AnalyticsService } from "./analytics.service.js";
import type { GeminiClient } from "../llm/gemini.js";
import type { ImpactService } from "./impact.service.js";
import type { SignalsService } from "./signals.service.js";

/**
 * Interrogate — ask the agent anything about the analysis and get a reasoned,
 * grounded answer. The model receives the ACTUAL computed data (report totals,
 * every active signal with reasoning and impact, company intelligence
 * summaries, the impact ledger) and is instructed to answer only from it,
 * citing companies and signals.
 */
export interface AskResult {
  answer: string;
  answeredBy: "gemini" | "offline";
}

export class AskService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly signals: SignalsService,
    private readonly impact: ImpactService,
    private readonly llm: GeminiClient,
  ) {}

  async ask(question: string): Promise<AskResult> {
    const [snapshot, run, contexts, impact] = await Promise.all([
      this.analytics.getSnapshot(),
      this.signals.run(),
      this.signals.getContexts(),
      this.impact.summary(),
    ]);
    const report = buildReceivablesReport(snapshot);
    const contactName = new Map(snapshot.contacts.map((c) => [c.contactId, c.name]));

    const grounding = {
      asOf: snapshot.asOf,
      book: {
        contacts: snapshot.contacts.length,
        invoices: snapshot.invoices.length,
        outstandingOverdue: report.recoverable.totalOutstanding,
        expectedRecoverable: report.recoverable.totalExpectedRecoverable,
        bills: snapshot.bills?.length ?? 0,
      },
      impactLedger: impact,
      signals: run.signals.map((s) => ({
        id: s.id,
        type: s.type,
        severity: s.severity,
        impact: s.impact,
        company: s.contactId ? contactName.get(s.contactId) : undefined,
        title: s.title,
        reasoning: s.reasoning,
      })),
      paymentPatterns: report.paymentPatterns
        .filter((p) => p.sampleSize > 0)
        .map((p) => ({
          company: contactName.get(p.contactId),
          avgDaysLate: p.avgDaysLate,
          stdDaysLate: p.stdDaysLate,
          trend: p.trend,
          settledInvoices: p.sampleSize,
        })),
      companyIntel: contexts.map((c) => ({
        company: c.companyName,
        chFlags: c.companiesHouse?.flags ?? [],
        gazetteNotices: c.gazetteNotices?.length ?? 0,
        negativeNews: (c.news ?? []).filter((n) => n.sentiment === "negative").length,
        positiveNews: (c.news ?? []).filter((n) => n.sentiment === "positive").length,
      })),
    };

    if (this.llm.enabled) {
      const answer = await this.llm.complete({
        system:
          "You are Signal's analyst. Answer the user's question using ONLY the grounding data " +
          "provided — computed metrics, active signals, company intelligence and the impact " +
          "ledger. Show brief reasoning, name the companies and signals you relied on, and give " +
          "concrete numbers. If the data cannot answer the question, say exactly what is missing. " +
          "Plain text, under 200 words.",
        prompt: JSON.stringify({ question, grounding }),
        maxTokens: 800,
      });
      if (answer) return { answer: answer.trim(), answeredBy: "gemini" };
    }

    // Offline: a grounded headline summary so the endpoint is still useful.
    const worst = run.signals[0];
    return {
      answeredBy: "offline",
      answer:
        `Live reasoning needs GEMINI_API_KEY — here is the current state instead. ` +
        `As of ${snapshot.asOf}: ${round(report.recoverable.totalOutstanding)} overdue across ` +
        `${report.slipRisk.length} invoices (${round(report.recoverable.totalExpectedRecoverable)} realistically recoverable). ` +
        `${run.signals.length} active signals` +
        (worst ? `; most pressing: "${worst.title}" (${worst.severity}).` : ".") +
        ` Unlocked so far: ${impact.totalUnlocked} (${impact.cashRecovered} cash recovered, ` +
        `${impact.pipelineCreated} pipeline, ${impact.savingsCaptured} savings).`,
    };
  }
}
