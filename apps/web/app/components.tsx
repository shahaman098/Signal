import type { ReactNode } from "react";
import type { Severity } from "@signal/core";
import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  Calendar,
  CircleCheck,
  Clock,
  Eye,
  InfoCircle,
  Mail,
  TrendUp,
  XCircle,
  Zap,
} from "./icons";

/** Shared presentational pieces — one look, used by every page. */

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  icon,
  sub,
  link,
  children,
}: {
  title: string;
  icon?: ReactNode;
  sub?: string;
  link?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          {icon} {title}
        </h2>
        {link && <span className="card-link">{link}</span>}
      </div>
      {sub && <p className="card-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Kpi({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        {icon} {label}
      </div>
      <div className="kpi-value">{value}</div>
      {note && <div className="kpi-note">{note}</div>}
    </div>
  );
}

export function ErrorBanner() {
  return (
    <div className="err-banner">
      <AlertOctagon size={20} />
      <div>
        Couldn&apos;t reach the API. Start it with <code>npm run dev:api</code> and reload this page.
      </div>
    </div>
  );
}

// ---- Badges (status = icon + label, never color alone) ----

export function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, { cls: string; icon: ReactNode }> = {
    urgent: { cls: "critical", icon: <AlertOctagon size={12} /> },
    high: { cls: "serious", icon: <AlertTriangle size={12} /> },
    medium: { cls: "warning", icon: <Clock size={12} /> },
    info: { cls: "neutral", icon: <InfoCircle size={12} /> },
  };
  const { cls, icon } = map[severity];
  return (
    <span className={`badge ${cls}`}>
      {icon} {severity}
    </span>
  );
}

export function RiskBadge({ band, score }: { band: "low" | "medium" | "high"; score?: number }) {
  const map = {
    high: { cls: "serious", icon: <AlertTriangle size={12} /> },
    medium: { cls: "warning", icon: <Clock size={12} /> },
    low: { cls: "good", icon: <CircleCheck size={12} /> },
  } as const;
  const { cls, icon } = map[band];
  return (
    <span className={`badge ${cls}`}>
      {icon} {band}
      {score !== undefined ? ` ${score.toFixed(2)}` : ""}
    </span>
  );
}

export type DecisionKind = "act-now" | "schedule" | "monitor" | "dismiss";

export function DecisionBadge({ decision }: { decision: DecisionKind }) {
  const map: Record<DecisionKind, { cls: string; icon: ReactNode }> = {
    "act-now": { cls: "critical", icon: <Zap size={12} /> },
    schedule: { cls: "warning", icon: <Calendar size={12} /> },
    monitor: { cls: "neutral", icon: <Eye size={12} /> },
    dismiss: { cls: "neutral", icon: <XCircle size={12} /> },
  };
  const { cls, icon } = map[decision];
  return (
    <span className={`badge ${cls}`}>
      {icon} {decision}
    </span>
  );
}

export function ActionChip({ kind }: { kind: string }) {
  const icon =
    kind === "chase-email" ? (
      <Mail size={12} />
    ) : kind === "create-quote" || kind === "convert-recurring" ? (
      <TrendUp size={12} />
    ) : kind === "pay-bill-early" || kind === "defer-bill" ? (
      <Banknote size={12} />
    ) : (
      <Eye size={12} />
    );
  return (
    <span className="chip">
      {icon} {kind}
    </span>
  );
}

// ---- utils ----

export function gbp(n: number): string {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

export function trim(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
