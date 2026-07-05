import Link from "next/link";
import { api } from "../../lib/api";
import { Card, ErrorBanner, PageHeader, trim } from "../components";
import { AlertOctagon, Building, CircleCheck, ExternalLink, FileText } from "../icons";
import { ConfirmMatch } from "../confirm-match";

export const dynamic = "force-dynamic";

/**
 * Company intelligence: registry match per counterparty (with human
 * confirmation when search wasn't safe), filings, Gazette notices and news.
 */
export default async function CompaniesPage() {
  let contexts: Awaited<ReturnType<typeof api.contexts>>;
  try {
    contexts = await api.contexts();
  } catch {
    return (
      <>
        <PageHeader title="Companies" sub="Registry data, filings, official notices and press" />
        <ErrorBanner />
      </>
    );
  }

  const matched = contexts.filter((c) => c.companiesHouse);
  const withCandidates = contexts.filter((c) => !c.companiesHouse && (c.chCandidates?.length ?? 0) > 0);
  const unmatched = contexts.length - matched.length;

  const sorted = [...contexts].sort(
    (a, b) => Number(!!b.companiesHouse) - Number(!!a.companiesHouse) || a.companyName.localeCompare(b.companyName),
  );

  return (
    <>
      <PageHeader
        title="Companies"
        sub={`${contexts.length} counterparties · ${matched.length} matched to Companies House · ${withCandidates.length} awaiting your confirmation · ${unmatched - withCandidates.length} no candidates`}
      />

      <Card
        title="Counterparty intelligence"
        icon={<Building size={15} />}
        sub="Hover any link or badge for detail. Confirming a match pins it permanently."
      >
        <table className="data">
          <thead>
            <tr>
              <th>Company</th>
              <th>Registry (Companies House)</th>
              <th style={{ width: 190 }}>Latest filing</th>
              <th style={{ width: 230 }}>News & notices</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ctx) => {
              const ch = ctx.companiesHouse;
              const filing = ch?.filings?.[0];
              const firstNews = ctx.gazetteNotices?.[0]
                ? { url: ctx.gazetteNotices[0].url, title: ctx.gazetteNotices[0].title, tag: "Gazette", critical: true }
                : (ctx.news ?? [])[0]
                  ? { url: ctx.news[0]!.url, title: ctx.news[0]!.title, tag: `${ctx.news[0]!.source} · ${ctx.news[0]!.sentiment}`, critical: ctx.news[0]!.sentiment === "negative" }
                  : null;
              const moreCount = (ctx.news ?? []).length + (ctx.gazetteNotices?.length ?? 0) - (firstNews ? 1 : 0);
              const officerDetail = ch?.officers
                ? [
                    `${ch.officers.activeCount} active officers`,
                    ch.officers.resignedLast12m > 0 ? `${ch.officers.resignedLast12m} resigned in 12m` : null,
                    ch.chargesOutstanding ? `${ch.chargesOutstanding} charges outstanding` : null,
                    ch.accountsNextDue ? `accounts due ${ch.accountsNextDue}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "";
              return (
                <tr key={ctx.contactId}>
                  <td style={{ fontWeight: 550, whiteSpace: "nowrap" }}>
                    <Link href={`/companies/${encodeURIComponent(ctx.contactId)}`} style={{ color: "var(--ink)" }}>
                      {ctx.companyName}
                    </Link>
                    <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>{ctx.role}</span>
                  </td>
                  <td>
                    {ch ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <a href={ch.profileUrl} target="_blank" rel="noreferrer" title={officerDetail}>
                          <ExternalLink size={11} /> {ch.companyNumber}
                        </a>
                        {ctx.matchConfidence && ctx.matchConfidence !== "exact" && (
                          <span className="chip">{ctx.matchConfidence}</span>
                        )}
                        {(ch.flags ?? []).length > 0 ? (
                          <span className="badge critical" title={(ch.flags ?? []).join(", ")}>
                            <AlertOctagon size={12} /> {(ch.flags ?? []).length === 1 ? ch.flags![0] : `${ch.flags!.length} flags`}
                          </span>
                        ) : (
                          <span className="badge good" title={officerDetail}>
                            <CircleCheck size={12} /> {ch.status}
                          </span>
                        )}
                      </span>
                    ) : (
                      <ConfirmMatch contactId={ctx.contactId} candidates={ctx.chCandidates ?? []} />
                    )}
                  </td>
                  <td>
                    {filing ? (
                      filing.pdfUrl ? (
                        <a href={filing.pdfUrl} target="_blank" rel="noreferrer" title={filing.description}>
                          <FileText size={11} /> {filing.date}
                        </a>
                      ) : (
                        <span className="reason" title={filing.description}>{filing.date}</span>
                      )
                    ) : (
                      <span className="empty">—</span>
                    )}
                  </td>
                  <td>
                    {firstNews ? (
                      <>
                        <a href={firstNews.url} target="_blank" rel="noreferrer" title={firstNews.title}>
                          <ExternalLink size={11} /> {trim(firstNews.title, 30)}
                        </a>{" "}
                        <span style={{ color: firstNews.critical ? "var(--critical)" : "var(--muted)", fontSize: 10.5 }}>
                          {firstNews.tag}
                          {moreCount > 0 ? ` +${moreCount}` : ""}
                        </span>
                      </>
                    ) : (
                      <span className="empty">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
