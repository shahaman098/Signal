import { api } from "../../lib/api";
import { Card, ErrorBanner, Kpi, PageHeader } from "../components";
import { AlertTriangle, Building, Radar, Sparkles, TrendUp } from "../icons";
import { CreativeRadarPanel } from "./radar-panel";

export const dynamic = "force-dynamic";

function healthBadge(health: "thriving" | "aging" | "fatiguing" | "declining", score: number) {
  const cls =
    health === "thriving"
      ? "good"
      : health === "aging"
        ? "warning"
        : health === "fatiguing"
          ? "serious"
          : "critical";
  return <span className={`badge ${cls}`}>{health} {score.toFixed(2)}</span>;
}

export default async function CreativePage() {
  let overview: Awaited<ReturnType<typeof api.creativeOverview>>;
  let error: string | null = null;
  try {
    overview = await api.creativeOverview();
  } catch (err) {
    error = err instanceof Error ? err.message : "Creative radar is unavailable.";
    return (
      <>
        <PageHeader
          title="Creative Radar"
          sub="Portfolio fatigue, saturation signals, and Qwen-guided refresh strategy"
        />
        <div className="err-banner">
          {error.includes("503") || error.includes("CreativeNotConfigured")
            ? "Creative Radar needs the upstream creative backend configured with live data."
            : error}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Creative Radar"
        sub={`${overview.brand.name} · ${overview.brand.category} · owned vs competitor creative patterns`}
      />

      <section className="kpis">
        <Kpi
          icon={<Building size={15} />}
          label="Owned creatives"
          value={String(overview.stats.total)}
          note={`${overview.stats.familyCount} creative families`}
        />
        <Kpi
          icon={<AlertTriangle size={15} />}
          label="Fatiguing or declining"
          value={String(overview.stats.fatiguingCount)}
          note="needs refresh"
        />
        <Kpi
          icon={<TrendUp size={15} />}
          label="Average health"
          value={`${Math.round(overview.stats.avgHealth * 100)}/100`}
          note="scored from run length, reach, and variants"
        />
        <Kpi
          icon={<Sparkles size={15} />}
          label="Radar signals"
          value={String(overview.metaSignals.length)}
          note="used to ground the Qwen brief"
        />
      </section>

      <div className="grid-2">
        <Card
          title="Family Weak Spots"
          icon={<Radar size={15} />}
          sub="Lowest-health families first. Repeated variants with falling health are the strongest fatigue signal."
        >
          <div className="row-list">
            {overview.families.map((family) => (
              <div className="row" key={family.id}>
                <div className="row-title">
                  <strong>{family.label}</strong>
                  <div className="creative-mini">{family.ads.length} ads · avg {Math.round(family.avgHealth * 100)}/100</div>
                </div>
                <div className="creative-pill-row">
                  {family.ads.map((ad) => (
                    <span className="chip" key={ad.id}>{ad.platform} · {ad.hook}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Pattern Map"
          icon={<Sparkles size={15} />}
          sub="Saturation status blends repetition and creative health across owned and competitor ads."
        >
          <div className="row-list">
            {overview.patterns.map((pattern) => (
              <div className="row" key={pattern.label}>
                <div className="row-title">
                  <strong>{pattern.label}</strong>
                  <div className="creative-mini">{pattern.note}</div>
                </div>
                <div className="creative-pattern-side">
                  <span className={`badge ${pattern.status === "rising" ? "good" : pattern.status === "open" ? "warning" : "serious"}`}>
                    {pattern.status}
                  </span>
                  <span className="row-meta">{pattern.count} ads · {Math.round(pattern.avgHealth * 100)}/100</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Owned Portfolio"
        icon={<Building size={15} />}
        sub="Scored creative nodes imported from the new ad-intelligence feature."
      >
        <table className="data">
          <thead>
            <tr>
              <th>Creative</th>
              <th>Family</th>
              <th>Platform</th>
              <th className="num">Run days</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {overview.ads.map((ad) => (
              <tr key={ad.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{ad.title}</div>
                  <div className="creative-mini">{ad.hook} · {ad.proofStyle} · {ad.cta}</div>
                </td>
                <td>{ad.familyLabel}</td>
                <td>{ad.platform}</td>
                <td className="num">{ad.runDays}</td>
                <td>{healthBadge(ad.health, ad.healthScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title="Qwen Creative Brief"
        icon={<Sparkles size={15} />}
        sub="Ask for saturation analysis, white-space, or refresh concepts. The prompt is grounded in the imported portfolio signals."
      >
        <CreativeRadarPanel overview={overview} />
      </Card>
    </>
  );
}
