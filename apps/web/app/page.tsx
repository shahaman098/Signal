import type { Severity, Signal, SignalCategory } from "@signal/core";
import { api, type AgentDecision } from "../lib/api";
import { ChaseEmailButton } from "./chase-email-button";
import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  Building,
  Calendar,
  CircleCheck,
  Clock,
  Compass,
  ExternalLink,
  Eye,
  FileText,
  InfoCircle,
  Mail,
  Radar,
  Sparkles,
  TrendUp,
  XCircle,
  Zap,
} from "./icons";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof loadData>>;
  try {
    data = await loadData();
  } catch {
    return (
      <main>
        <Masthead sub="Xero · Companies House · news → signals → agent decisions" />
        <div className="err-banner">
          <AlertOctagon size={20} />
          <div>
            Couldn&apos;t reach the API. Start it with <code>npm run dev:api</code> and reload this page.
          </div>
        </div>
      </main>
    );
  }

  const { report, recoverable, proposals, signalRun, agentRun, contacts, contexts } = data;
  const name = new Map(contacts.map((c) => [c.contactId, c.name]));
  const urgentHigh =
    (signalRun.countsBySeverity["urgent"] ?? 0) + (signalRun.countsBySeverity["high"] ?? 0);

  return (
    <main>
      <Masthead sub={`As of ${report.asOf} · ${signalRun.signals.length} signals · decided by ${agentRun.decidedBy}`} />

      {/* ---- KPIs ---- */}
      <section className="kpis">
        <Kpi icon={<Banknote size={20} />} tint="var(--blue)" label="Outstanding receivables" value={gbp(recoverable.totalOutstanding)} />
        <Kpi icon={<CircleCheck size={20} />} tint="var(--good-text)" label="Expected recoverable" value={gbp(recoverable.totalExpectedRecoverable)} />
        <Kpi icon={<Sparkles size={20} />} tint="var(--violet)" label="Active signals" value={String(signalRun.signals.length)} />
        <Kpi icon={<AlertTriangle size={20} />} tint="var(--critical)" label="Urgent + high priority" value={String(urgentHigh)} />
      </section>

      {/* ---- Agent decisions ---- */}
      <section className="card">
        <h2>
          <Zap size={16} /> Agent decisions
        </h2>
        <p className="card-sub">
          Each signal weighed against the company&apos;s full context — Companies House flags, filings and news.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th style={{ width: 110 }}>Decision</th>
              <th>Signal</th>
              <th style={{ width: 160 }}>Action</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {agentRun.decisions.slice(0, 10).map((d) => (
              <tr key={d.signalId}>
                <td className="num">{d.priority}</td>
                <td>
                  <DecisionBadge decision={d.decision} />
                </td>
                <td style={{ maxWidth: 320 }}>{d.signalTitle}</td>
                <td>
                  <ActionChip kind={d.action.kind} />
                </td>
                <td>
                  <div className="reason">{trim(d.reasoning, 170)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- Signals by category ---- */}
      <section className="cat-grid" style={{ marginBottom: 20 }}>
        {CATEGORIES.map((cat) => {
          const items = signalRun.signals.filter((s) => s.category === cat.key);
          return (
            <div className="cat-card" key={cat.key}>
              <div className="cat-head">
                <span
                  className="cat-icon"
                  style={{ background: `color-mix(in srgb, ${cat.tint} 12%, white)`, color: cat.tint }}
                >
                  {cat.icon}
                </span>
                <h3>{cat.label}</h3>
                <span className="count">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="empty">Nothing detected.</p>
              ) : (
                <>
                  {diversify(items, 6).map((s) => (
                    <SignalRow key={s.id} signal={s} />
                  ))}
                  {items.length > 6 && (
                    <p className="empty" style={{ margin: "8px 0 0" }}>
                      + {items.length - 6} more
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </section>

      {/* ---- Company intelligence ---- */}
      <section className="card">
        <h2>
          <Building size={16} /> Company intelligence
        </h2>
        <p className="card-sub">
          Companies House registry data and financial news per counterparty — refreshed by ingestion, one
          context file per company.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Company</th>
              <th style={{ width: 90 }}>Role</th>
              <th>Registry (Companies House)</th>
              <th>Latest filing</th>
              <th>News</th>
            </tr>
          </thead>
          <tbody>
            {[...contexts]
              .sort((a, b) => Number(!!b.companiesHouse) - Number(!!a.companiesHouse) || a.companyName.localeCompare(b.companyName))
              .map((ctx) => {
                const ch = ctx.companiesHouse;
                const filing = ch?.filings[0];
                const news = ctx.news.slice(0, 2);
                return (
                  <tr key={ctx.contactId}>
                    <td>{ctx.companyName}</td>
                    <td>
                      <span className="chip">{ctx.role}</span>
                    </td>
                    <td>
                      {ch ? (
                        <>
                          <a href={ch.profileUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={12} /> {ch.companyName} ({ch.companyNumber})
                          </a>{" "}
                          {ch.flags.length > 0 ? (
                            <span className="badge critical" style={{ marginLeft: 4 }}>
                              <AlertOctagon size={13} /> {ch.flags.join(", ")}
                            </span>
                          ) : (
                            <span className="badge good" style={{ marginLeft: 4 }}>
                              <CircleCheck size={13} /> {ch.status}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="empty">no verified match</span>
                      )}
                    </td>
                    <td>
                      {filing ? (
                        filing.pdfUrl ? (
                          <a href={filing.pdfUrl} target="_blank" rel="noreferrer">
                            <FileText size={12} /> {filing.date} {trim(filing.description, 34)}
                          </a>
                        ) : (
                          <span className="reason">{filing.date} {trim(filing.description, 34)}</span>
                        )
                      ) : (
                        <span className="empty">—</span>
                      )}
                    </td>
                    <td>
                      {news.length === 0 ? (
                        <span className="empty">—</span>
                      ) : (
                        news.map((n) => (
                          <div key={n.url} style={{ marginBottom: 2 }}>
                            <a href={n.url} target="_blank" rel="noreferrer">
                              <ExternalLink size={12} /> {trim(n.title, 48)}
                            </a>{" "}
                            <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
                              {n.source} · {n.sentiment}
                            </span>
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </section>

      {/* ---- Receivables at risk ---- */}
      <section className="card">
        <h2>
          <Banknote size={16} /> Overdue invoices, ranked by slip risk
        </h2>
        <p className="card-sub">Chase emails are tone-matched to each customer&apos;s payment history.</p>
        <table className="data">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th className="num">Amount due</th>
              <th className="num">Days overdue</th>
              <th style={{ width: 110 }}>Risk</th>
              <th>Why</th>
              <th style={{ width: 170 }}></th>
            </tr>
          </thead>
          <tbody>
            {report.slipRisk.map((r) => (
              <tr key={r.invoiceId}>
                <td>{r.invoiceId}</td>
                <td>{name.get(r.contactId) ?? r.contactId}</td>
                <td className="num">{gbp(r.amountDue)}</td>
                <td className="num">{r.daysOverdue}</td>
                <td>
                  <RiskBadge band={r.band} score={r.score} />
                </td>
                <td>
                  <div className="reason">{r.reasons.join("; ")}</div>
                </td>
                <td>
                  <ChaseEmailButton invoiceId={r.invoiceId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- Reactivation offers ---- */}
      <section className="card">
        <h2>
          <TrendUp size={16} /> Reactivation offers
        </h2>
        <p className="card-sub">Churn-risk customers with a drafted welcome-back quote ready to send.</p>
        {proposals.length === 0 ? (
          <p className="empty">No customers currently flagged for reactivation.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th>
                <th style={{ width: 130 }}>Churn risk</th>
                <th>Signals</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.contactId}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <Building size={15} style={{ color: "var(--muted)" }} /> {p.contactName}
                    </span>
                  </td>
                  <td>
                    <RiskBadge band={p.churnScore >= 0.66 ? "high" : "medium"} score={p.churnScore} />
                  </td>
                  <td>
                    <div className="reason">{p.rationale.join(" · ")}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

// ---- data ----

async function loadData() {
  const [report, recoverable, proposals, signalRun, agentRun, contacts, contexts] = await Promise.all([
    api.report(),
    api.recoverable(),
    api.reactivationProposals(),
    api.signals(),
    api.agentDecide(),
    api.contacts(),
    api.contexts(),
  ]);
  return { report, recoverable, proposals, signalRun, agentRun, contacts, contexts };
}

// ---- presentational pieces ----

function Masthead({ sub }: { sub: string }) {
  return (
    <header className="masthead">
      <div className="brand-mark">S</div>
      <div>
        <h1>Signal</h1>
        <p className="sub">{sub}</p>
      </div>
    </header>
  );
}

function Kpi({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="kpi">
      <span className="kpi-icon" style={{ background: `color-mix(in srgb, ${tint} 11%, white)`, color: tint }}>
        {icon}
      </span>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
      </div>
    </div>
  );
}

const CATEGORIES: { key: SignalCategory; label: string; tint: string; icon: React.ReactNode }[] = [
  { key: "cash-recovery", label: "Cash recovery", tint: "var(--blue)", icon: <Banknote size={17} /> },
  { key: "revenue-growth", label: "Revenue growth", tint: "var(--aqua)", icon: <TrendUp size={17} /> },
  { key: "cashflow-timing", label: "Cash flow timing", tint: "var(--orange)", icon: <Clock size={17} /> },
  { key: "strategic", label: "Strategic", tint: "var(--violet)", icon: <Compass size={17} /> },
  { key: "anomaly", label: "Anomaly & hygiene", tint: "var(--red)", icon: <Radar size={17} /> },
];

function SignalRow({ signal }: { signal: Signal }) {
  const links = signal.evidence.filter((e) => e.url).slice(0, 2);
  return (
    <div className="signal-row">
      <SeverityBadge severity={signal.severity} />
      <div>
        <div className="signal-title">{signal.title}</div>
        {links.length > 0 && (
          <div className="evidence">
            {links.map((e) => (
              <a key={e.url} href={e.url} target="_blank" rel="noreferrer">
                <ExternalLink size={12} /> {trim(e.label, 42)}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, { cls: string; icon: React.ReactNode }> = {
    urgent: { cls: "critical", icon: <AlertOctagon size={13} /> },
    high: { cls: "serious", icon: <AlertTriangle size={13} /> },
    medium: { cls: "warning", icon: <Clock size={13} /> },
    info: { cls: "neutral", icon: <InfoCircle size={13} /> },
  };
  const { cls, icon } = map[severity];
  return (
    <span className={`badge ${cls}`}>
      {icon} {severity}
    </span>
  );
}

function RiskBadge({ band, score }: { band: "low" | "medium" | "high"; score: number }) {
  const map = {
    high: { cls: "serious", icon: <AlertTriangle size={13} /> },
    medium: { cls: "warning", icon: <Clock size={13} /> },
    low: { cls: "good", icon: <CircleCheck size={13} /> },
  } as const;
  const { cls, icon } = map[band];
  return (
    <span className={`badge ${cls}`}>
      {icon} {band} {score.toFixed(2)}
    </span>
  );
}

function DecisionBadge({ decision }: { decision: AgentDecision["decision"] }) {
  const map: Record<AgentDecision["decision"], { cls: string; icon: React.ReactNode }> = {
    "act-now": { cls: "critical", icon: <Zap size={13} /> },
    schedule: { cls: "warning", icon: <Calendar size={13} /> },
    monitor: { cls: "neutral", icon: <Eye size={13} /> },
    dismiss: { cls: "neutral", icon: <XCircle size={13} /> },
  };
  const { cls, icon } = map[decision];
  return (
    <span className={`badge ${cls}`}>
      {icon} {decision}
    </span>
  );
}

function ActionChip({ kind }: { kind: string }) {
  const icon =
    kind === "chase-email" ? (
      <Mail size={13} />
    ) : kind === "create-quote" || kind === "convert-recurring" ? (
      <TrendUp size={13} />
    ) : kind === "pay-bill-early" || kind === "defer-bill" ? (
      <Banknote size={13} />
    ) : (
      <Eye size={13} />
    );
  return (
    <span className="chip">
      {icon} {kind}
    </span>
  );
}

// ---- utils ----

/**
 * Pick up to `limit` signals, guaranteeing each distinct type appears before any
 * type repeats — so one noisy detector can't crowd the others out of the card.
 */
function diversify(items: Signal[], limit: number): Signal[] {
  const seen = new Set<string>();
  const firstOfType: Signal[] = [];
  const rest: Signal[] = [];
  for (const s of items) {
    if (seen.has(s.type)) rest.push(s);
    else {
      seen.add(s.type);
      firstOfType.push(s);
    }
  }
  return [...firstOfType, ...rest].slice(0, limit);
}

function gbp(n: number): string {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

function trim(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
