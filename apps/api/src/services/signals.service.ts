import {
  runSignalEngine,
  type CompanyContext,
  type SignalRunResult,
  type XeroPort,
} from "@signal/core";
import type { ContextStore } from "./context-store.js";
import type { IngestionService } from "./ingestion.service.js";

/**
 * Combines the Xero snapshot with the persisted company contexts and runs the
 * signal engine. If the context store is empty (first boot), it triggers one
 * ingestion pass so signals always have company intelligence to work with.
 */
export class SignalsService {
  constructor(
    private readonly xero: XeroPort,
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
      this.xero.snapshot(),
      this.getContexts(),
    ]);
    return runSignalEngine({ ...snapshot, companyContexts });
  }
}
