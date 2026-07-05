import { api } from "../../lib/api";
import { ErrorBanner, PageHeader } from "../components";
import { SourcesFeed } from "./sources-feed";

export const dynamic = "force-dynamic";

/**
 * The evidence layer: every piece of external intelligence the tool has
 * gathered — financial news, official Gazette notices, Companies House
 * filings — in one dated feed. Each item links to its source and to the
 * company brief it feeds into.
 */
export default async function SourcesPage() {
  let items: Awaited<ReturnType<typeof api.sources>>;
  try {
    items = await api.sources();
  } catch {
    return (
      <>
        <PageHeader title="Sources" sub="News, official notices and registry filings" />
        <ErrorBanner />
      </>
    );
  }

  const counts = {
    news: items.filter((i) => i.type === "news").length,
    gazette: items.filter((i) => i.type === "gazette").length,
    filing: items.filter((i) => i.type === "filing").length,
  };

  return (
    <>
      <PageHeader
        title="Sources"
        sub={`${items.length} evidence items across your counterparties — ${counts.news} news · ${counts.gazette} Gazette notices · ${counts.filing} registry filings. Every brief, signal and proposal traces back here.`}
      />
      <SourcesFeed items={items} />
    </>
  );
}
