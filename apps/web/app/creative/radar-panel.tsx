"use client";

import { useState } from "react";
import {
  api,
  type CreativeAutopilotRun,
  type CreativeOverview,
  type CreativeRadarEnvelope,
} from "../../lib/api";

const PROMPTS = [
  "What creative territory should we test next?",
  "Which family is most fatigued, and why?",
  "How are competitors winning right now?",
];

const REVIEW_ITEMS = [
  { id: "brandFit", label: "Matches the brand strategy and product promise" },
  { id: "platformFit", label: "Fits the target channel and creative format" },
  { id: "fatigueCheck", label: "Introduces enough novelty to avoid fatigue" },
] as const;

type ReviewItemId = (typeof REVIEW_ITEMS)[number]["id"];
type ReviewState = Record<ReviewItemId, boolean>;

const EMPTY_REVIEW: ReviewState = {
  brandFit: false,
  platformFit: false,
  fatigueCheck: false,
};

export function CreativeRadarPanel({ overview }: { overview: CreativeOverview }) {
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [result, setResult] = useState<CreativeRadarEnvelope | null>(null);
  const [agentRun, setAgentRun] = useState<CreativeAutopilotRun | null>(null);
  const [loadingMode, setLoadingMode] = useState<null | "radar" | "agent">(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState>(EMPTY_REVIEW);
  const [approved, setApproved] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy handoff note");

  async function run() {
    if (!prompt.trim()) return;
    setLoadingMode("radar");
    setError(null);
    try {
      const next = await api.creativeRadar(prompt);
      setResult(next);
      setAgentRun(null);
      setReview(EMPTY_REVIEW);
      setApproved(false);
      setCopyLabel("Copy handoff note");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creative radar failed");
    } finally {
      setLoadingMode(null);
    }
  }

  async function runAutopilot() {
    setLoadingMode("agent");
    setError(null);
    try {
      const next = await api.creativeAutopilot(prompt.trim() ? prompt : undefined);
      setAgentRun(next);
      setResult({ mode: next.mode, result: next.brief });
      setReview(EMPTY_REVIEW);
      setApproved(false);
      setCopyLabel("Copy handoff note");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creative autopilot failed");
    } finally {
      setLoadingMode(null);
    }
  }

  const reviewComplete = Object.values(review).every(Boolean);

  function toggleReview(id: ReviewItemId) {
    setReview((current) => ({ ...current, [id]: !current[id] }));
    setApproved(false);
  }

  async function copyHandoffNote() {
    if (!result) return;
    const lines = [
      `# ${result.result.brief.title}`,
      "",
      `Brand: ${overview.brand.name}`,
      `Category: ${overview.brand.category}`,
      `Widget: ${result.result.widget}`,
      `Prompt: ${prompt}`,
      "",
      "## Summary",
      result.result.text,
      "",
      "## Narrative",
      result.result.brief.narrative,
      "",
      "## Strategy",
      ...result.result.brief.strategy.map((item) => `- ${item}`),
      "",
      "## Alerts",
      ...result.result.brief.alerts.map((alert) => `- ${alert.level}: ${alert.text}`),
      "",
      "## Grounding Signals",
      ...overview.metaSignals.map((item) => `- ${item}`),
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyLabel("Copied");
    } catch {
      setCopyLabel("Copy failed");
    }
  }

  return (
    <div className="creative-radar">
      <div className="creative-chip-row">
        {PROMPTS.map((item) => (
          <button key={item} className="chat-chip" onClick={() => setPrompt(item)}>
            {item}
          </button>
        ))}
      </div>

      <div className="creative-input-row">
        <textarea
          className="creative-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask Qwen about fatigue, competitors, or a new creative brief"
        />
        <div className="creative-actions">
          <button className="btn primary" disabled={loadingMode !== null} onClick={() => void runAutopilot()}>
            {loadingMode === "agent" ? "Thinking…" : "Run Autopilot Agent"}
          </button>
          <button className="btn" disabled={loadingMode !== null} onClick={() => void run()}>
            {loadingMode === "radar" ? "Thinking…" : "Run Creative Radar"}
          </button>
        </div>
      </div>

      {!result && !error && (
        <div className="creative-muted">
          Grounding signals: {overview.metaSignals.join(" ")}
        </div>
      )}

      {error && <div className="err-banner">{error}</div>}

      {result && (
        <div className="creative-output">
          {agentRun && (
            <div className="creative-agent">
              <div className="creative-agent-head">
                <div>
                  <div className="creative-checkpoint-label">Autopilot Agent</div>
                  <div className="creative-checkpoint-title">{agentRun.recommendation.title}</div>
                </div>
                <span className="badge warning">{agentRun.status}</span>
              </div>

              <p className="creative-copy">{agentRun.goal}</p>

              <div className="creative-agent-grid">
                <div className="creative-metric">
                  <div className="creative-metric-label">Action Type</div>
                  <div className="creative-agent-value">{agentRun.recommendation.type}</div>
                </div>
                <div className="creative-metric">
                  <div className="creative-metric-label">First Move</div>
                  <div className="creative-agent-copy">{agentRun.recommendation.firstMove}</div>
                </div>
                <div className="creative-metric">
                  <div className="creative-metric-label">Expected Impact</div>
                  <div className="creative-agent-copy">{agentRun.recommendation.expectedImpact}</div>
                </div>
              </div>

              <div className="grid-2" style={{ marginTop: 14 }}>
                <div className="draft" style={{ maxWidth: "none" }}>
                  <div className="draft-subject">Agent rationale</div>
                  <p className="creative-copy">{agentRun.recommendation.rationale}</p>
                  <div className="creative-list">
                    {agentRun.nextActions.map((step) => (
                      <div className="row" key={step}>
                        <div className="row-title">{step}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="draft" style={{ maxWidth: "none" }}>
                  <div className="draft-subject">Grounding evidence</div>
                  <div className="creative-list">
                    {agentRun.evidence.weakestFamily && (
                      <div className="row">
                        <div className="row-title">
                          <strong>Weakest family</strong>
                          <div className="creative-mini">
                            {agentRun.evidence.weakestFamily.label} · {Math.round(agentRun.evidence.weakestFamily.avgHealth * 100)}/100 · {agentRun.evidence.weakestFamily.adCount} ads
                          </div>
                        </div>
                      </div>
                    )}
                    {agentRun.evidence.strongestCompetitor && (
                      <div className="row">
                        <div className="row-title">
                          <strong>Strongest competitor</strong>
                          <div className="creative-mini">
                            {agentRun.evidence.strongestCompetitor.brand} · {agentRun.evidence.strongestCompetitor.hook} · {agentRun.evidence.strongestCompetitor.platform}
                          </div>
                        </div>
                      </div>
                    )}
                    {agentRun.evidence.openPattern && (
                      <div className="row">
                        <div className="row-title">
                          <strong>Open pattern</strong>
                          <div className="creative-mini">
                            {agentRun.evidence.openPattern.label} · {agentRun.evidence.openPattern.note}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="creative-output-top">
            <span className="badge neutral">{result.mode}</span>
            <span className="row-meta">{result.result.widget}</span>
          </div>

          <p className="creative-lead">{result.result.text}</p>

          <div className="creative-metric-grid">
            {result.result.brief.metrics.map((metric) => (
              <div className="creative-metric" key={metric.label}>
                <div className="creative-metric-label">{metric.label}</div>
                <div className="creative-metric-value">{metric.value}</div>
              </div>
            ))}
          </div>

          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="draft" style={{ maxWidth: "none" }}>
              <div className="draft-subject">{result.result.brief.title}</div>
              <p className="creative-copy">{result.result.brief.narrative}</p>
              <div className="creative-list">
                {result.result.brief.strategy.map((step) => (
                  <div className="row" key={step}>
                    <div className="row-title">{step}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="draft" style={{ maxWidth: "none" }}>
              <div className="draft-subject">Alerts</div>
              <div className="creative-list">
                {result.result.brief.alerts.map((alert) => (
                  <div className="row" key={`${alert.level}-${alert.text}`}>
                    <div className="row-title">
                      <strong>{alert.level}</strong>
                      <div className="creative-mini">{alert.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="creative-thoughts">
            {result.result.thinking.map((item) => (
              <span className="chip" key={item}>{item}</span>
            ))}
          </div>

          <div className="creative-checkpoint">
            <div className="creative-checkpoint-head">
              <div>
                <div className="creative-checkpoint-label">Human checkpoint</div>
                <div className="creative-checkpoint-title">Operator approval gate</div>
              </div>
              <span className={`badge ${approved ? "good" : reviewComplete ? "warning" : "neutral"}`}>
                {approved ? "approved" : reviewComplete ? "ready for review" : "review required"}
              </span>
            </div>

            <p className="creative-mini">
              Signal does not auto-ship a Qwen brief into production. A human operator confirms the brief is brand-safe,
              platform-fit, and novel enough before handoff.
            </p>

            <div className="creative-review-list">
              {REVIEW_ITEMS.map((item) => (
                <label className="creative-review-item" key={item.id}>
                  <input
                    type="checkbox"
                    checked={review[item.id]}
                    onChange={() => toggleReview(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <div className="creative-actions">
              <button className="btn" onClick={() => void copyHandoffNote()}>
                {copyLabel}
              </button>
              <button
                className="btn primary"
                disabled={!reviewComplete}
                onClick={() => setApproved(true)}
              >
                Approve brief
              </button>
            </div>

            {approved && (
              <div className="creative-approved-note">
                Approved for creative-team handoff. Use the copied note as the operator-reviewed brief.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
