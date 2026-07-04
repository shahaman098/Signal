import { api } from "../lib/api";
import { ChaseEmailButton } from "./chase-email-button";

// Server component: fetches the analysis report from the Express API on each load.
export default async function DashboardPage() {
  let report: Awaited<ReturnType<typeof api.report>>;
  let recoverable: Awaited<ReturnType<typeof api.recoverable>>;
  let proposals: Awaited<ReturnType<typeof api.reactivationProposals>>;

  try {
    [report, recoverable, proposals] = await Promise.all([
      api.report(),
      api.recoverable(),
      api.reactivationProposals(),
    ]);
  } catch {
    return (
      <main>
        <h1>Signal</h1>
        <p style={{ color: "#f0a" }}>
          Couldn&apos;t reach the API. Start it with <code>npm run dev:api</code> and reload.
        </p>
      </main>
    );
  }

  const contactName = new Map(report.paymentPatterns.map((p) => [p.contactId, p.contactId]));
  for (const c of proposals) contactName.set(c.contactId, c.contactName);

  return (
    <main>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Signal</h1>
        <p style={{ color: "#9aa0ad", marginTop: 4 }}>
          Xero receivables intelligence — as of {report.asOf}
        </p>
      </header>

      <section style={kpiRow}>
        <Kpi label="Outstanding" value={money(recoverable.totalOutstanding)} />
        <Kpi label="Expected recoverable" value={money(recoverable.totalExpectedRecoverable)} />
        <Kpi label="High slip-risk invoices" value={String(report.slipRisk.filter((r) => r.band === "high").length)} />
        <Kpi label="High churn-risk customers" value={String(report.churn.filter((c) => c.band === "high").length)} />
      </section>

      <Card title="Slip-risk — overdue invoices ranked">
        <table style={table}>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Customer</Th>
              <Th align="right">Amount due</Th>
              <Th align="right">Days overdue</Th>
              <Th align="right">Score</Th>
              <Th>Why</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {report.slipRisk.map((r) => (
              <tr key={r.invoiceId}>
                <Td>{r.invoiceId}</Td>
                <Td>{contactName.get(r.contactId) ?? r.contactId}</Td>
                <Td align="right">{money(r.amountDue)}</Td>
                <Td align="right">{r.daysOverdue}</Td>
                <Td align="right">
                  <Badge band={r.band}>{r.score.toFixed(2)}</Badge>
                </Td>
                <Td>{r.reasons.join("; ")}</Td>
                <Td>
                  <ChaseEmailButton invoiceId={r.invoiceId} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Reactivation offers — churn-risk customers (flagship)">
        {proposals.length === 0 ? (
          <p style={{ color: "#9aa0ad" }}>No customers currently flagged for reactivation.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {proposals.map((p) => (
              <li key={p.contactId} style={{ marginBottom: 8 }}>
                <strong>{p.contactName}</strong>{" "}
                <Badge band={p.churnScore >= 0.66 ? "high" : "medium"}>
                  churn {p.churnScore.toFixed(2)}
                </Badge>
                <div style={{ color: "#9aa0ad", fontSize: 13 }}>{p.rationale.join(" · ")}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}

// ---- tiny presentational helpers ----

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

const kpiRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 24,
};

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#151923", borderRadius: 12, padding: 16 }}>
      <div style={{ color: "#9aa0ad", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#151923", borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ textAlign: align, padding: "8px 10px", color: "#9aa0ad", borderBottom: "1px solid #262b36" }}>
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <td style={{ textAlign: align, padding: "8px 10px", borderBottom: "1px solid #1c212c" }}>{children}</td>
  );
}

function Badge({ band, children }: { band: "low" | "medium" | "high"; children: React.ReactNode }) {
  const color = band === "high" ? "#ff6b6b" : band === "medium" ? "#ffd166" : "#4dd39a";
  return (
    <span style={{ color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{children}</span>
  );
}
