import { api } from "../lib/api";
import { ErrorBanner, PageHeader } from "./components";
import { MoneyHome } from "./money-home";

export const dynamic = "force-dynamic";

/**
 * The home: your money as a pipeline (Found → In motion → Landed), the next
 * best move ranked by impact, one-tap actions with a step-by-step plan, and
 * the ask-anything chat overlay. All numbers live from the API.
 */
export default async function OverviewPage() {
  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch {
    return (
      <>
        <PageHeader title="Overview" sub="Xero · Companies House · news → signals → actions" />
        <ErrorBanner />
      </>
    );
  }

  return <MoneyHome proposals={data.proposals} impact={data.impact} asOf={data.asOf} />;
}

async function load() {
  const [proposals, impact, signalRun] = await Promise.all([
    api.proposals(),
    api.impact(),
    api.signals(),
  ]);
  return { proposals, impact, asOf: signalRun.asOf };
}
