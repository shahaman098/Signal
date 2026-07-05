import { api } from "../../lib/api";
import { ErrorBanner, PageHeader } from "../components";
import { GenerateButton } from "./generate-button";
import { ProposalCard } from "./proposal-card";

export const dynamic = "force-dynamic";

/**
 * The Plan stage: every proposed action with its full chain of inputs —
 * reasoning, metrics, comparison charts, registry filings, Gazette notices and
 * news — reviewed by a human before anything customer-visible happens.
 */
export default async function PlanPage() {
  let proposals: Awaited<ReturnType<typeof api.proposals>>;
  try {
    proposals = await api.proposals();
  } catch {
    return (
      <>
        <PageHeader title="Plan" sub="Review reasoning, then approve or reject proposed actions" />
        <ErrorBanner />
      </>
    );
  }

  const awaiting = proposals.filter((p) => p.status === "proposed");
  const done = proposals.filter((p) => p.status !== "proposed");

  return (
    <>
      <PageHeader
        title="Plan"
        sub={
          awaiting.length > 0
            ? `${awaiting.length} proposal${awaiting.length === 1 ? "" : "s"} awaiting review — nothing customer-visible executes without approval`
            : "Nothing awaiting review — generate to run detection over the latest data"
        }
        actions={<GenerateButton />}
      />

      {proposals.length === 0 && (
        <div className="card">
          <p className="empty">
            No proposals yet — hit <strong>Generate proposals</strong> to run signal detection and the
            agent&apos;s decision pass over the latest Xero + Companies House + news data.
          </p>
        </div>
      )}

      {awaiting.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <div className="overline">Awaiting review ({awaiting.length})</div>
          {awaiting.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section>
          <div className="overline">History ({done.length})</div>
          {done.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </section>
      )}
    </>
  );
}
