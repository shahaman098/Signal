import Link from "next/link";
import { api } from "../../../lib/api";
import { ActionChip, Card, ErrorBanner, PageHeader, SeverityBadge, trim } from "../../components";
import {
  AlertOctagon,
  Building,
  CircleCheck,
  Compass,
  ExternalLink,
  FileText,
  Radar,
  Sparkles,
} from "../../icons";
import { MicroChart } from "../../micro-chart";

export const dynamic = "force-dynamic";

/**
 * The Company Brief: one page per counterparty pulling every thread together —
 * the written brief composed from the data, key metrics, behaviour charts,
 * registry status, active signals, evidence timeline and proposal history.
 */
export default async function CompanyBriefPage({
  params,
}: {
  params: { contactId: string };
}) {
  let brief: Awaited<ReturnType<typeof api.companyBrief>>;
  try {
    brief = await api.companyBrief(params.contactId);
  } catch {
    return (
      <>
        <PageHeader title="Company brief" sub={params.contactId} />
        <ErrorBanner />
        <p className="empty" style={{ marginTop: 12 }}>
          If the API is up, this company may not have a context yet — run a refresh from{" "}
          <Link href="/companies">Companies</Link>.
        </p>
      </>
    );
  }

  const { context: ctx, metrics, series, signals, proposals, evidence } = brief;
  const ch = ctx.companiesHouse;
  const flags = ch?.flags ?? [];

  return (
    <>
      <PageHeader
        title={ctx.companyName}
        sub={`${ctx.role}${ch ? ` · ${ch.companyName} (${ch.companyNumber})` : " · no verified registry match"}${ctx.matchConfidence && ctx.matchConfidence !== "exact" ? ` · match: ${ctx.matchConfidence}` : ""}`}
        actions={
          <>
            {ch?.profileUrl && (
              <a href={ch.profileUrl} target="_blank" rel="noreferrer" className="btn">
                <Building size={14} /> Companies House
              </a>
            )}
            <Link href="/companies" className="btn">
              ← All companies
            </Link>
          </>
        }
      />

      {/* The brief itself */}
      <Card
        title="Brief"
        icon={<Sparkles size={15} />}
        sub={`Composed from the data by ${brief.briefBy === "gemini" ? "Gemini (grounded in computed metrics)" : "deterministic rules"}.`}
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>{brief.brief}</p>
        {flags.length > 0 && (
          <p style={{ marginTop: 10, marginBottom: 0 }}>
            <span className="badge critical">
              <AlertOctagon size={12} /> {flags.join(", ")}
            </span>
          </p>
        )}
      </Card>

      {/* Metrics + behaviour charts */}
      {(metrics.length > 0 || series.length > 0) && (
        <Card title="Behaviour" icon={<Radar size={15} />}>
          <div className="metric-chips">
            {metrics.map((m) => (
              <span key={m.label} className={`metric-chip ${m.tone ?? "neutral"}`}>
                <span className="metric-label">{m.label}</span> {m.value}
              </span>
            ))}
          </div>
          <div className="chart-grid">
            {series.map((s) => (
              <MicroChart key={s.id} series={s} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid-2" style={{ marginTop: 16 }}>
        {/* Active signals */}
        <Card
          title={`Signals (${signals.length})`}
          icon={<Radar size={15} />}
          link={<Link href="/plan">Act in Plan →</Link>}
        >
          {signals.length === 0 ? (
            <p className="empty">No active signals for this company.</p>
          ) : (
            <div className="row-list">
              {signals.map((s) => (
                <div className="row" key={s.id}>
                  <SeverityBadge severity={s.severity} />
                  <span className="row-title" title={s.reasoning.join("\n")}>
                    {trim(s.title, 56)}
                  </span>
                  <ActionChip kind={s.recommendedAction.kind} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Proposal history */}
        <Card
          title={`Proposals (${proposals.length})`}
          icon={<Compass size={15} />}
          link={<Link href="/plan">Plan →</Link>}
        >
          {proposals.length === 0 ? (
            <p className="empty">Nothing proposed yet for this company.</p>
          ) : (
            <div className="row-list">
              {proposals.map((p) => (
                <div className="row" key={p.id}>
                  <span className={`badge ${p.status === "executed" ? "good" : p.status === "proposed" ? "warning" : "neutral"}`}>
                    {p.status === "executed" ? <CircleCheck size={12} /> : null} {p.status}
                  </span>
                  <span className="row-title" title={p.reasoning.decisionReasoning}>
                    {trim(p.title, 54)}
                  </span>
                  {p.result?.deepLink && (
                    <a href={p.result.deepLink} target="_blank" rel="noreferrer" className="row-meta" style={{ color: "var(--blue)" }}>
                      Xero <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Evidence timeline */}
      <div style={{ marginTop: 16 }}>
        <Card
          title={`Evidence (${evidence.length})`}
          icon={<FileText size={15} />}
          sub="Every external item feeding this brief — news, official notices, registry filings."
          link={<Link href="/sources">All sources →</Link>}
        >
          {evidence.length === 0 ? (
            <p className="empty">No external evidence gathered for this company yet.</p>
          ) : (
            <div className="row-list">
              {evidence.slice(0, 12).map((e, i) => (
                <div className="row" key={`${e.url}-${i}`}>
                  <span className="row-meta" style={{ width: 78, flex: "none" }}>
                    {e.date}
                  </span>
                  <span className="chip" style={{ flex: "none" }}>
                    {e.type}
                  </span>
                  <span className="row-title">
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        {trim(e.title, 64)} <ExternalLink size={11} />
                      </a>
                    ) : (
                      trim(e.title, 64)
                    )}
                  </span>
                  <span className="row-meta">{e.source}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
