import type { ReactNode } from "react";
import { AlertOctagon } from "./icons";

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
        Couldn&apos;t reach the creative API. Start it with <code>npm run dev:api</code> and reload this page.
      </div>
    </div>
  );
}

// ---- utils ----

export function gbp(n: number): string {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

export function trim(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
