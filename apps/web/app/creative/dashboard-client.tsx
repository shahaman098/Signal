"use client";

import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CreativeAutopilotRun } from "../../lib/api";
import {
  AlertTriangle,
  ArrowUpRight,
  Bars,
  Bell,
  MinusCircle,
  PlusCircle,
  Search,
  Sparkles,
  TrendUp,
} from "../icons";
import { CreativeRadarPanel } from "./radar-panel";

const WORLD_MASK = [
  "0000000000001111000000001111000000",
  "0000000011111111110000111111110000",
  "0000011111111111111111111111111100",
  "0000111111111111111111111111111110",
  "0011111100111111111111110011111110",
  "0011111000011111111111100001111110",
  "0001111000011111111111100001111000",
  "0000111100111111001111110011110000",
  "0000011111111110000111111111100000",
  "0000001111111100000011111110000000",
  "0000000111111000000001111100000000",
  "0000000011110000000000111000000000",
];

const SECTION_HASH = {
  overview: "#overview",
  campaigns: "#campaigns",
  operator: "#operator",
  portfolio: "#portfolio",
  pressure: "#pressure-board",
  approval: "#approval-gate",
} as const;

type SectionHash = (typeof SECTION_HASH)[keyof typeof SECTION_HASH];
type WorkspaceTab = "manager" | "canvas" | "monitoring";
type WatchlistSort = "priority" | "alphabetical";

function compact(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function metricValue(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

function asPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function ringStyle(value: number, primary: string, trail: string) {
  return {
    background: `conic-gradient(${primary} ${value * 360}deg, ${trail} 0deg)`,
  };
}

function dotTone(index: number) {
  if (index % 11 === 0) return "signal-map-dot saturated";
  if (index % 5 === 0) return "signal-map-dot open";
  return "signal-map-dot rising";
}

function cardTone(index: number) {
  if (index % 4 === 0) return "thriving";
  if (index % 4 === 1) return "aging";
  if (index % 4 === 2) return "fatiguing";
  return "declining";
}

function headline(run: CreativeAutopilotRun) {
  return run.recommendation.title || run.brief.brief.title || run.nextActions[0] || run.goal;
}

function normalizeHash(hash: string): SectionHash {
  if (Object.values(SECTION_HASH).includes(hash as SectionHash)) {
    return hash as SectionHash;
  }
  return SECTION_HASH.overview;
}

function TopMetric({
  title,
  value,
  note,
  children,
}: {
  title: string;
  value: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="monitor-card metric-card">
      <div className="monitor-card-title">{title}</div>
      <div className="metric-card-body">
        <div>
          <div className="metric-card-value">{value}</div>
          <div className="metric-card-note">{note}</div>
        </div>
        {children}
      </div>
    </section>
  );
}

export function CreativeDashboard({ run }: { run: CreativeAutopilotRun }) {
  const evidenceFeed = [...run.evidence.bullets, ...run.evidence.metaSignals];
  const strategyFeed = run.brief.suggestions.length > 0 ? run.brief.suggestions : run.brief.brief.strategy;
  const totalSignals =
    evidenceFeed.length +
    run.humanCheckpoints.length +
    run.nextActions.length +
    strategyFeed.length;
  const confidence = Math.min(0.94, 0.34 + totalSignals * 0.045);
  const reviewRatio =
    run.humanCheckpoints.length === 0
      ? 1
      : Math.min(1, run.nextActions.length / run.humanCheckpoints.length);

  const [activeHash, setActiveHash] = useState<SectionHash>(SECTION_HASH.overview);
  const [watchlistExpanded, setWatchlistExpanded] = useState(false);
  const [watchlistSort, setWatchlistSort] = useState<WatchlistSort>("priority");
  const [mapZoom, setMapZoom] = useState(1);

  useEffect(() => {
    function syncHash() {
      setActiveHash(normalizeHash(window.location.hash));
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (activeHash === SECTION_HASH.pressure) {
      setWatchlistExpanded(true);
    }
    if (activeHash === SECTION_HASH.operator || activeHash === SECTION_HASH.approval) {
      setWatchlistExpanded(false);
    }
  }, [activeHash]);

  function navigateToHash(nextHash: SectionHash) {
    startTransition(() => setActiveHash(nextHash));

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }

    const target = document.getElementById(nextHash.slice(1));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function adjustMapZoom(direction: 1 | -1) {
    setMapZoom((current) => {
      const next = Math.min(1.35, Math.max(0.8, Number((current + direction * 0.1).toFixed(2))));
      return next;
    });
  }

  const workspaceTab: WorkspaceTab =
    activeHash === SECTION_HASH.portfolio
      ? "canvas"
      : activeHash === SECTION_HASH.campaigns
        ? "monitoring"
        : "manager";

  const showOperatorOnly = activeHash === SECTION_HASH.operator || activeHash === SECTION_HASH.approval;
  const showTopStack = activeHash !== SECTION_HASH.portfolio && activeHash !== SECTION_HASH.pressure;
  const showTerrain = activeHash === SECTION_HASH.overview || activeHash === SECTION_HASH.campaigns;
  const showPressure = activeHash === SECTION_HASH.overview || activeHash === SECTION_HASH.campaigns || activeHash === SECTION_HASH.pressure;
  const showPortfolio = activeHash === SECTION_HASH.overview || activeHash === SECTION_HASH.portfolio;
  const operatorCompact = !(activeHash === SECTION_HASH.operator || activeHash === SECTION_HASH.approval);

  const watchlist = useMemo(() => {
    const items = [
      {
        label: run.provider ?? "Live provider",
        sub: run.model ?? "Qwen cloud model",
        value: metricValue(evidenceFeed.length),
        tone: "violet",
        priority: 1,
      },
      {
        label: "Operator checkpoints",
        sub: run.humanCheckpoints[0] ?? "Human review gate is active",
        value: metricValue(run.humanCheckpoints.length),
        tone: "amber",
        priority: 2,
      },
      {
        label: "Action queue",
        sub: run.nextActions[0] ?? "No follow-up actions returned",
        value: metricValue(run.nextActions.length),
        tone: "green",
        priority: 3,
      },
      {
        label: "Strategy stack",
        sub: strategyFeed[0] ?? run.brief.text,
        value: metricValue(strategyFeed.length),
        tone: "violet",
        priority: 4,
      },
      {
        label: "Weakest family",
        sub: run.evidence.weakestFamily
          ? `${run.evidence.weakestFamily.label} drifting into fatigue`
          : "No weakest-family signal returned",
        value: run.evidence.weakestFamily
          ? `${Math.round(run.evidence.weakestFamily.avgHealth * 100)}/100`
          : "n/a",
        tone: "amber",
        priority: 5,
      },
      {
        label: "Competitor edge",
        sub: run.evidence.strongestCompetitor
          ? `${run.evidence.strongestCompetitor.brand} still winning attention`
          : "No competitor edge signal returned",
        value: metricValue(Math.max(1, strategyFeed.length)),
        tone: "green",
        priority: 6,
      },
    ];

    const sorted = [...items].sort((left, right) => {
      if (watchlistSort === "alphabetical") {
        return left.label.localeCompare(right.label);
      }
      return left.priority - right.priority;
    });

    return watchlistExpanded ? sorted : sorted.slice(0, 4);
  }, [
    evidenceFeed.length,
    run.brief.text,
    run.evidence.strongestCompetitor,
    run.evidence.weakestFamily,
    run.humanCheckpoints,
    run.nextActions,
    run.provider,
    run.model,
    strategyFeed,
    watchlistExpanded,
    watchlistSort,
  ]);

  const deck = useMemo(() => {
    const actions = run.nextActions.map((item) => ({
      title: item,
      kind: "action" as const,
      description: "Live next action from Qwen autopilot",
    }));

    const strategies = strategyFeed.map((item) => ({
      title: item,
      kind: "strategy" as const,
      description: "Supporting strategy from the live brief",
    }));

    const combined = [...actions, ...strategies];
    if (activeHash === SECTION_HASH.portfolio) {
      return combined;
    }
    return combined.slice(0, 6);
  }, [activeHash, run.nextActions, strategyFeed]);

  return (
    <section className="dashboard-page" id="overview">
      <header className="dashboard-topbar">
        <div className="dashboard-greeting">
          <div className="dashboard-avatar">A</div>
          <div>
            <h1>Hello, Aman.</h1>
            <p>{totalSignals} live Qwen-backed operator signals are ready for review today.</p>
          </div>
        </div>
        <div className="dashboard-actions">
          <button className="icon-action" type="button" aria-label="Search">
            <Search size={22} />
          </button>
          <button className="icon-action icon-action-strong" type="button" aria-label="Notifications">
            <Bell size={22} />
            <span className="notification-dot" />
          </button>
        </div>
      </header>

      <section className="dashboard-toolbar">
        <div className="workspace-switches">
          <button
            className={`workspace-pill${workspaceTab === "manager" ? " active" : ""}`}
            type="button"
            onClick={() => navigateToHash(SECTION_HASH.overview)}
          >
            Manager
          </button>
          <button
            className={`workspace-pill${workspaceTab === "canvas" ? " active" : ""}`}
            type="button"
            onClick={() => navigateToHash(SECTION_HASH.portfolio)}
          >
            Canvas
          </button>
          <button
            className={`workspace-pill${workspaceTab === "monitoring" ? " active" : ""}`}
            type="button"
            onClick={() => navigateToHash(SECTION_HASH.campaigns)}
          >
            Monitoring
          </button>
        </div>
        <div className="dashboard-searchbar">
          <Search size={16} />
          <span>Search campaigns, evidence, and live recommendations</span>
        </div>
      </section>

      <section className="signal-filter-row" id="campaigns">
        <div className="signal-filter-title">Running Campaigns</div>
        <div className="signal-filter-pills">
          <span className="status-pill active">All <strong>{totalSignals}</strong></span>
          <span className="status-pill thriving">Evidence <strong>{evidenceFeed.length}</strong></span>
          <span className="status-pill aging">Checks <strong>{run.humanCheckpoints.length}</strong></span>
          <span className="status-pill fatiguing">Moves <strong>{run.nextActions.length}</strong></span>
          <span className="status-pill declining">Strategy <strong>{strategyFeed.length}</strong></span>
        </div>
      </section>

      {showTopStack && (
        <section className={`top-monitor-grid${showOperatorOnly ? " top-monitor-grid-operator-focus" : ""}`}>
          {!showOperatorOnly && (
            <div className="top-monitor-column">
              <div className="top-monitor-metrics">
                <TopMetric
                  title="Evidence trail"
                  value={metricValue(evidenceFeed.length)}
                  note="live web-grounded signals collected by the cloud agent"
                >
                  <div className="spark-lines">
                    <div className="spark-line spark-line-violet" />
                    <div className="spark-line spark-line-amber" />
                    <div className="spark-line-axis" />
                    <div className="spark-badge">{metricValue(evidenceFeed.length)}</div>
                  </div>
                </TopMetric>

                <TopMetric
                  title="Operator confidence"
                  value={asPercent(confidence)}
                  note="derived from live evidence, checks, and next actions"
                >
                  <div className="ring-chart" style={ringStyle(confidence, "var(--accent-violet)", "var(--panel-soft)")}>
                    <div className="ring-chart-center">{asPercent(confidence)}</div>
                  </div>
                </TopMetric>

                <TopMetric
                  title="Review flow"
                  value={asPercent(reviewRatio)}
                  note={`${run.humanCheckpoints.length} checkpoints are gating ${run.nextActions.length} live moves`}
                >
                  <div className="micro-bars">
                    {Array.from({ length: Math.max(4, Math.min(6, run.humanCheckpoints.length || 4)) }, (_, index) => (
                      <div className="micro-bar-stack" key={index}>
                        <span className="micro-bar micro-bar-muted" style={{ height: `${54 + (index % 3) * 12}px` }} />
                        <span
                          className={`micro-bar ${index % 3 === 0 ? "micro-bar-open" : index % 2 === 0 ? "micro-bar-rising" : "micro-bar-saturated"}`}
                          style={{ height: `${30 + index * 10}px` }}
                        />
                      </div>
                    ))}
                  </div>
                </TopMetric>
              </div>

              {showTerrain && (
                <section className="monitor-card terrain-card terrain-card-primary" id="terrain">
                  <div className="monitor-section-head">
                    <div>
                      <div className="monitor-card-title">Creative terrain</div>
                      <h2>Active signals</h2>
                    </div>
                    <div className="terrain-controls">
                      <button className="icon-lite" type="button" aria-label="Zoom in" onClick={() => adjustMapZoom(1)}>
                        <PlusCircle size={18} />
                      </button>
                      <button className="icon-lite" type="button" aria-label="Zoom out" onClick={() => adjustMapZoom(-1)}>
                        <MinusCircle size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="terrain-stage">
                    <div className="terrain-summary">
                      <div className="terrain-total">{metricValue(totalSignals)}</div>
                      <div className="terrain-wave">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="terrain-trend">
                        <ArrowUpRight size={14} />
                        {run.provider ?? "Alibaba Cloud Model Studio"}
                      </div>
                      <p>{run.goal}</p>
                      <button className="terrain-button" type="button" onClick={() => navigateToHash(SECTION_HASH.operator)}>
                        Operator brief
                      </button>
                    </div>

                    <div className="signal-map" style={{ transform: `scale(${mapZoom})`, transformOrigin: "center right" }}>
                      {WORLD_MASK.flatMap((row, rowIndex) =>
                        row.split("").map((entry, colIndex) => {
                          if (entry === "0") {
                            return <span className="signal-map-dot hidden" key={`${rowIndex}-${colIndex}`} />;
                          }
                          return (
                            <span
                              className={dotTone(rowIndex * row.length + colIndex)}
                              key={`${rowIndex}-${colIndex}`}
                            />
                          );
                        }),
                      )}
                    </div>
                  </div>

                  <div className="terrain-footer">
                    <div className="terrain-kpi">
                      <span>Signals</span>
                      <strong>{compact(evidenceFeed.length)}</strong>
                      <div className="terrain-meter"><span style={{ width: `${Math.min(94, 26 + evidenceFeed.length * 12)}%` }} /></div>
                    </div>
                    <div className="terrain-kpi">
                      <span>Strategy</span>
                      <strong>{compact(strategyFeed.length)}</strong>
                      <div className="terrain-meter"><span style={{ width: `${Math.min(92, 30 + strategyFeed.length * 12)}%` }} /></div>
                    </div>
                    <div className="terrain-kpi">
                      <span>Checks</span>
                      <strong>{compact(run.humanCheckpoints.length)}</strong>
                      <div className="terrain-meter"><span style={{ width: `${Math.min(90, 32 + run.humanCheckpoints.length * 11)}%` }} /></div>
                    </div>
                    <div className="terrain-kpi">
                      <span>Flow</span>
                      <strong>{asPercent(reviewRatio)}</strong>
                      <div className="terrain-meter"><span style={{ width: `${Math.round(reviewRatio * 100)}%` }} /></div>
                    </div>
                    <div className="terrain-kpi">
                      <span>Moves</span>
                      <strong>{compact(run.nextActions.length)}</strong>
                      <div className="terrain-meter"><span style={{ width: `${Math.min(88, 28 + run.nextActions.length * 13)}%` }} /></div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          <section className="monitor-card operator-card" id="operator">
            <div className="operator-card-head">
              <div>
                <div className="monitor-card-title">Signal Operator</div>
                <h2>{headline(run)}</h2>
              </div>
              <span className="operator-status">{run.status.replaceAll("_", " ")}</span>
            </div>
            <CreativeRadarPanel
              initialRun={run}
              workspaceLabel="Signal live creative workspace"
              contextSignals={evidenceFeed.slice(0, 6)}
              compact={operatorCompact}
            />
          </section>
        </section>
      )}

      {showPressure && (
        <section className="monitor-card watchlist-card watchlist-card-full" id="pressure-board">
          <div className="monitor-section-head">
            <div>
              <div className="monitor-card-title">Pressure board</div>
              <h2>Where to act next</h2>
            </div>
            <div className="watchlist-head-actions">
              <span className="watchlist-head-note">
                {watchlistSort === "priority" ? "Sorted by priority" : "Sorted A-Z"}
              </span>
              <button
                className="icon-lite"
                type="button"
                aria-label="More options"
                onClick={() => setWatchlistSort((current) => (current === "priority" ? "alphabetical" : "priority"))}
              >
                <Bars size={18} />
              </button>
            </div>
          </div>

          <div className="watchlist-feed">
            {watchlist.map((item) => (
              <div className="watchlist-item" key={item.label}>
                <div className={`watchlist-icon ${item.tone}`}>
                  {item.tone === "amber" ? <AlertTriangle size={18} /> : item.tone === "green" ? <TrendUp size={18} /> : <Sparkles size={18} />}
                </div>
                <div className="watchlist-copy">
                  <strong>{item.label}</strong>
                  <span>{item.sub}</span>
                </div>
                <div className={`watchlist-ring ${item.tone}`}>
                  <div className="watchlist-ring-inner">{item.value}</div>
                </div>
              </div>
            ))}
          </div>

          <button className="watchlist-button" type="button" onClick={() => setWatchlistExpanded((current) => !current)}>
            {watchlistExpanded ? "Show less" : "Show more"}
          </button>
        </section>
      )}

      {showPortfolio && (
        <section className="campaign-board" id="portfolio">
          <div className="monitor-section-head">
            <div>
              <div className="monitor-card-title">Portfolio board</div>
              <h2>Live operator action deck</h2>
            </div>
            <span className="campaign-board-note">{run.model ?? "qwen-plus"} · {run.status.replaceAll("_", " ")}</span>
          </div>
          <div className="campaign-grid">
            {deck.map((item, index) => (
              <article className="campaign-card" key={`${index}-${item.title}`}>
                <div className={`campaign-card-flag ${cardTone(index)}`} />
                <div className="campaign-card-media">
                  <div className="campaign-card-platform">{item.kind}</div>
                  <div className="campaign-card-score">{metricValue(index + 1)}</div>
                </div>
                <div className="campaign-card-body">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                  <div className="campaign-card-meta">
                    <span>{run.provider ?? "Alibaba Cloud"}</span>
                    <span>{run.model ?? "qwen-plus"}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
