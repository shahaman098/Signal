import Link from "next/link";
import { api } from "../../lib/api";
import { Card, ErrorBanner, gbp, Kpi, PageHeader, RiskBadge } from "../components";
import { Banknote, Building, CircleCheck, Mail, TrendUp } from "../icons";
import { ChaseEmailButton } from "../chase-email-button";
import { CreateQuoteButton } from "../create-quote-button";

export const dynamic = "force-dynamic";

/** The money view: what's owed, who slips, and offers to win revenue back. */
export default async function ReceivablesPage() {
  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch {
    return (
      <>
        <PageHeader title="Receivables" sub="Overdue invoices, slip risk and win-back offers" />
        <ErrorBanner />
      </>
    );
  }
  const { report, recoverable, proposals, contacts } = data;
  const name = new Map(contacts.map((c) => [c.contactId, c.name]));

  return (
    <>
      <PageHeader
        title="Receivables"
        sub={`As of ${report.asOf} — chase tones are matched to each customer's payment history`}
      />

      <section className="kpis">
        <Kpi icon={<Banknote size={15} />} label="Outstanding" value={gbp(recoverable.totalOutstanding)} />
        <Kpi
          icon={<CircleCheck size={15} />}
          label="Expected recoverable"
          value={gbp(recoverable.totalExpectedRecoverable)}
          note="risk-weighted"
        />
        <Kpi
          icon={<Mail size={15} />}
          label="Overdue invoices"
          value={String(report.slipRisk.length)}
          note={`${report.slipRisk.filter((r) => r.band === "high").length} high slip-risk`}
        />
      </section>

      <Card
        title="Overdue invoices, ranked by slip risk"
        icon={<Banknote size={15} />}
        sub="Hover a risk badge for the reasoning. Score blends days overdue with payment habit and trend."
      >
        {report.slipRisk.length === 0 ? (
          <p className="empty">Nothing overdue. 🎉</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th className="num">Due</th>
                <th className="num">Overdue</th>
                <th style={{ width: 120 }}>Risk</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {report.slipRisk.map((r) => (
                <tr key={r.invoiceId}>
                  <td style={{ fontWeight: 550 }}>{r.invoiceNumber ?? `…${r.invoiceId.slice(-6)}`}</td>
                  <td>
                    <Link href={`/companies/${encodeURIComponent(r.contactId)}`} style={{ color: "var(--ink)" }}>
                      {name.get(r.contactId) ?? r.contactId}
                    </Link>
                  </td>
                  <td className="num">{gbp(r.amountDue)}</td>
                  <td className="num">{r.daysOverdue}d</td>
                  <td title={r.reasons.join("\n")} style={{ cursor: "help" }}>
                    <RiskBadge band={r.band} score={r.score} />
                  </td>
                  <td>
                    <ChaseEmailButton invoiceId={r.invoiceId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title="Reactivation offers"
        icon={<TrendUp size={15} />}
        sub="Churn-risk customers with a drafted welcome-back quote. Approving in the Plan stage keeps the reasoning attached."
        link={<Link href="/plan">Review in Plan →</Link>}
      >
        {proposals.length === 0 ? (
          <p className="empty">No customers currently flagged for reactivation.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th>
                <th style={{ width: 140 }}>Churn risk</th>
                <th style={{ width: 190 }}></th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.contactId}>
                  <td style={{ fontWeight: 550 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <Building size={14} style={{ color: "var(--muted)" }} /> {p.contactName}
                    </span>
                  </td>
                  <td title={p.rationale.join("\n")} style={{ cursor: "help" }}>
                    <RiskBadge band={p.churnScore >= 0.66 ? "high" : "medium"} score={p.churnScore} />
                  </td>
                  <td>
                    <CreateQuoteButton proposal={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

async function load() {
  const [report, recoverable, proposals, contacts] = await Promise.all([
    api.report(),
    api.recoverable(),
    api.reactivationProposals(),
    api.contacts(),
  ]);
  return { report, recoverable, proposals, contacts };
}
