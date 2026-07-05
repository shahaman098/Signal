import type {
  CompanyContext,
  CompanyIntelPort,
  CompanyRole,
  GazettePort,
  NewsPort,
} from "@signal/core";
import type { AnalyticsService } from "./analytics.service.js";
import type { ContextStore } from "./context-store.js";

export interface RefreshResult {
  updated: number;
  matched: { exact: number; probable: number; confirmed: number; none: number };
  pruned: number;
}

/**
 * Keeps the per-company context files fresh: for every Xero contact (customers)
 * and supplier, look up Companies House (tiered matching), news (composite
 * sources) and Gazette notices, then persist the merged context.
 *
 * Human-confirmed matches (matchConfidence "confirmed") are pinned: refreshed
 * by company number, never re-searched.
 */
export class IngestionService {
  private refreshing?: Promise<RefreshResult>;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly intel: CompanyIntelPort,
    private readonly news: NewsPort,
    private readonly gazette: GazettePort,
    private readonly store: ContextStore,
  ) {}

  /** Refresh every known counterparty (deduped if already in flight). */
  async refreshAll(): Promise<RefreshResult> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefreshAll().finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  private async doRefreshAll(): Promise<RefreshResult> {
    const snapshot = await this.analytics.getSnapshot();
    const targets = new Map<string, { name: string; role: CompanyRole }>();
    for (const c of snapshot.contacts) targets.set(c.contactId, { name: c.name, role: "customer" });
    for (const s of snapshot.suppliers ?? []) {
      if (!s.contactId) continue;
      const existing = targets.get(s.contactId);
      targets.set(s.contactId, { name: s.name, role: existing ? "both" : "supplier" });
    }

    const matched = { exact: 0, probable: 0, confirmed: 0, none: 0 };
    let updated = 0;
    for (const [contactId, { name, role }] of targets) {
      const ctx = await this.refreshOne(contactId, name, role);
      matched[ctx.matchConfidence ?? "none"] += 1;
      updated += 1;
    }

    // Prune contexts for contacts that no longer exist in Xero (e.g. leftover
    // demo-data files after switching adapters) so the dashboard reflects
    // reality.
    let pruned = 0;
    for (const existing of await this.store.loadAll()) {
      if (!targets.has(existing.contactId)) {
        await this.store.remove(existing.contactId);
        pruned += 1;
      }
    }

    return { updated, matched, pruned };
  }

  async refreshOne(contactId: string, companyName: string, role: CompanyRole): Promise<CompanyContext> {
    const previous = await this.store.load(contactId);

    const [lookup, news, gazetteNotices] = await Promise.all([
      this.resolveCompany(previous, companyName),
      this.news.searchCompanyNews(companyName).catch(() => []),
      this.gazette.searchNotices(companyName).catch(() => []),
    ]);

    const context: CompanyContext = {
      contactId,
      companyName,
      role,
      companyNumber: lookup.data?.companyNumber,
      matchConfidence: lookup.confidence,
      chCandidates: lookup.candidates,
      companiesHouse: lookup.data,
      news,
      gazetteNotices,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    await this.store.save(context);
    return context;
  }

  /** Pinned contacts refresh by number; everyone else goes through tiered search. */
  private async resolveCompany(
    previous: CompanyContext | null,
    companyName: string,
  ): Promise<{ confidence: CompanyContext["matchConfidence"]; data?: CompanyContext["companiesHouse"]; candidates?: CompanyContext["chCandidates"] }> {
    if (previous?.matchConfidence === "confirmed" && previous.companyNumber && this.intel.lookupByNumber) {
      const data = await this.intel.lookupByNumber(previous.companyNumber).catch(() => null);
      if (data) return { confidence: "confirmed", data };
      // Number no longer resolves — fall through to search.
    }
    const result = await this.intel.lookupCompany(companyName).catch(() => null);
    if (!result) return { confidence: "none", candidates: [] };
    return { confidence: result.confidence, data: result.data, candidates: result.candidates };
  }

  /** Human confirmation: pin a company number to a contact and refresh it. */
  async confirmCompanyNumber(contactId: string, companyNumber: string): Promise<CompanyContext> {
    const previous = await this.store.load(contactId);
    if (!previous) throw new Error(`No context for contact ${contactId}`);
    if (!this.intel.lookupByNumber) throw new Error("Adapter does not support lookup by number");
    const data = await this.intel.lookupByNumber(companyNumber);
    if (!data) throw new Error(`Company ${companyNumber} not found at Companies House`);

    const context: CompanyContext = {
      ...previous,
      companyNumber,
      matchConfidence: "confirmed",
      chCandidates: undefined,
      companiesHouse: data,
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
