import { api, type CreativeAutopilotRun } from "../../lib/api";
import { CreativeDashboard } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function CreativePage() {
  let run: CreativeAutopilotRun;
  let error: string | null = null;

  try {
    run = await api.creativeAutopilot();
  } catch (err) {
    error = err instanceof Error ? err.message : "Creative radar is unavailable.";
    return (
      <section className="dashboard-page">
        <header className="dashboard-topbar">
          <div className="dashboard-greeting">
            <div className="dashboard-avatar">S</div>
            <div>
              <h1>Hello, creative lead.</h1>
              <p>Signal could not load the live creative workspace.</p>
            </div>
          </div>
        </header>
        <div className="err-banner">{error}</div>
      </section>
    );
  }

  return <CreativeDashboard run={run} />;
}
