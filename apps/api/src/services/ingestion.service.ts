import type {
  CompanyContext,
  CompanyIntelPort,
  CompanyRole,
  NewsPort,
  XeroPort,
} from "@signal/core";
import type { ContextStore } from "./context-store.js";

/**
 * Keeps the per-company context files fresh: for every Xero contact (customers)
 * and supplier, look up Companies House + news and persist the merged context.
 *
 * Trigger paths:
 *   - POST /api/context/refresh (manual / cron)
 *   - CompaniesHouseStream events (real-time registry changes) call
 *     refreshOne() for the affected company
 *   - lazy: the signals service refreshes once if the store is empty
 */
export class IngestionService {
  private refreshing?: Promise<{ updated: number }>;

  constructor(
    private readonly xero: XeroPort,
    private readonly intel: CompanyIntelPort,
    private readonly news: NewsPort,
    private readonly store: ContextStore,
  ) {}

  /** Refresh every known counterparty (deduped if already in flight). */
  async refreshAll(): Promise<{ updated: number }> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefreshAll().finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  private async doRefreshAll(): Promise<{ updated: number }> {
    const snapshot = await this.xero.snapshot();
    const targets = new Map<string, { name: string; role: CompanyRole }>();
    for (const c of snapshot.contacts) targets.set(c.contactId, { name: c.name, role: "customer" });
    for (const s of snapshot.suppliers ?? []) {
      if (!s.contactId) continue;
      const existing = targets.get(s.contactId);
      targets.set(s.contactId, {
        name: s.name,
        role: existing ? "both" : "supplier",
      });
    }

    let updated = 0;
    for (const [contactId, { name, role }] of targets) {
      await this.refreshOne(contactId, name, role);
      updated += 1;
    }
    return { updated };
  }

  async refreshOne(contactId: string, companyName: string, role: CompanyRole): Promise<CompanyContext> {
    const [companiesHouse, news] = await Promise.all([
      this.intel.lookupCompany(companyName).catch(() => null),
      this.news.searchCompanyNews(companyName).catch(() => []),
    ]);

    const context: CompanyContext = {
      contactId,
      companyName,
      role,
      companyNumber: companiesHouse?.companyNumber,
      companiesHouse: companiesHouse ?? undefined,
      news,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    await this.store.save(context);
    return context;
  }

  /** Company numbers we track — feeds the Companies House stream filter. */
  async trackedCompanyNumbers(): Promise<Set<string>> {
    const contexts = await this.store.loadAll();
    return new Set(contexts.map((c) => c.companyNumber).filter((n): n is string => !!n));
  }
}
