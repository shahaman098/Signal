import {
  runSignalEngine,
  type CompanyContext,
  type SignalRunResult,
} from "@signal/core";
import type { AnalyticsService } from "./analytics.service.js";
import type { ContextStore } from "./context-store.js";
import type { IngestionService } from "./ingestion.service.js";

/**
 * Combines the Xero snapshot with the persisted company contexts and runs the
 * signal engine. Snapshots come through AnalyticsService's cache — against a
 * real org a snapshot is many paginated MCP calls, and a single dashboard load
 * hits several endpoints; without the shared cache each one would re-sweep Xero.
 */
export class SignalsService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly store: ContextStore,
    private readonly ingestion: IngestionService,
  ) {}

  async getContexts(): Promise<CompanyContext[]> {
    let contexts = await this.store.loadAll();
    if (contexts.length === 0) {
      await this.ingestion.refreshAll();
      contexts = await this.store.loadAll();
    }
    return contexts;
  }

  async run(): Promise<SignalRunResult> {
    const [snapshot, companyContexts] = await Promise.all([
      this.analytics.getSnapshot(),
      this.getContexts(),
    ]);
    return runSignalEngine({ ...snapshot, companyContexts });
  }
}
