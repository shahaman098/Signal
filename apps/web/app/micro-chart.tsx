import type { MetricSeries } from "@signal/core";

/**
 * Tiny inline-SVG chart for a proposal's input series — no chart library.
 * Bars for discrete per-invoice events (lateness), a line for order values.
 * Positive lateness renders red-ish (bad), early/negative renders green.
 */
export function MicroChart({ series }: { series: MetricSeries }) {
  const W = 240;
  const H = 56;
  const PAD = 4;
  const points = series.points;
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const lo = Math.min(...values, series.baseline ?? Infinity);
  const hi = Math.max(...values, series.baseline ?? -Infinity);
  const range = hi - lo || 1;
  const y = (v: number) => PAD + (H - 2 * PAD) * (1 - (v - lo) / range);
  const x = (i: number) => PAD + (W - 2 * PAD) * (points.length === 1 ? 0.5 : i / (points.length - 1));
  const slotW = Math.max(2, Math.min(10, (W - 2 * PAD) / points.length - 2));

  const first = points[0]!;
  const last = points.at(-1)!;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 2 }}>
        {series.title}
        <span style={{ float: "right" }}>
          {first.date.slice(0, 7)} → {last.date.slice(0, 7)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`${series.title}: ${points.length} points from ${fmt(first.value, series.unit)} to ${fmt(last.value, series.unit)}`}
        style={{ display: "block", background: "var(--page)", borderRadius: 6 }}
      >
        {series.baseline !== undefined && (
          <line x1={PAD} x2={W - PAD} y1={y(series.baseline)} y2={y(series.baseline)} stroke="var(--hairline)" strokeWidth={1} />
        )}
        {series.kind === "bar" ? (
          points.map((p, i) => {
            const base = y(series.baseline ?? lo);
            const top = y(p.value);
            const bad = series.unit === "days" ? p.value > 0 : false;
            return (
              <rect
                key={`${p.date}-${i}`}
                x={x(i) - slotW / 2}
                y={Math.min(top, base)}
                width={slotW}
                height={Math.max(1.5, Math.abs(base - top))}
                rx={1.5}
                fill={bad ? "var(--serious)" : "var(--aqua)"}
              >
                <title>{`${p.label ?? p.date}: ${fmt(p.value, series.unit)}`}</title>
              </rect>
            );
          })
        ) : (
          <>
            <polyline
              fill="none"
              stroke="var(--blue)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
            />
            {points.map((p, i) => (
              <circle key={`${p.date}-${i}`} cx={x(i)} cy={y(p.value)} r={2.5} fill="var(--blue)">
                <title>{`${p.label ?? p.date}: ${fmt(p.value, series.unit)}`}</title>
              </circle>
            ))}
          </>
        )}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--muted)" }}>
        <span>min {fmt(lo, series.unit)}</span>
        <span>max {fmt(hi, series.unit)}</span>
      </div>
    </div>
  );
}

function fmt(v: number, unit: MetricSeries["unit"]): string {
  if (unit === "days") return `${Math.round(v)}d`;
  return v.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}
