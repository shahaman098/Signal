import {
  makeDemoCompanyContexts,
  type CompaniesHouseData,
  type CompanyIntelPort,
  type CompanyLookupResult,
  type GazetteNotice,
  type GazettePort,
  type NewsItem,
  type NewsPort,
} from "@signal/core";

/**
 * Fake company-intelligence adapters, keyed off the demo contexts. Companies we
 * "know" return their canned Companies House data / news; anything else gets an
 * empty candidates list — so ingestion always succeeds offline.
 */

const contexts = makeDemoCompanyContexts();
const byName = new Map(contexts.map((c) => [c.companyName.toLowerCase(), c]));

export class FakeCompanyIntelAdapter implements CompanyIntelPort {
  async lookupCompany(companyName: string): Promise<CompanyLookupResult> {
    const known = byName.get(companyName.toLowerCase());
    if (known?.companiesHouse) return { confidence: "exact", data: known.companiesHouse };
    return { confidence: "none", candidates: [] };
  }

  async lookupByNumber(companyNumber: string): Promise<CompaniesHouseData | null> {
    for (const c of contexts) {
      if (c.companiesHouse?.companyNumber === companyNumber) return c.companiesHouse;
    }
    return null;
  }
}

export class FakeNewsAdapter implements NewsPort {
  async searchCompanyNews(companyName: string): Promise<NewsItem[]> {
    return byName.get(companyName.toLowerCase())?.news ?? [];
  }
}

export class FakeGazetteAdapter implements GazettePort {
  async searchNotices(companyName: string): Promise<GazetteNotice[]> {
    if (companyName.toLowerCase().includes("dana retail")) {
      return [
        {
          date: "2026-06-16",
          title: "Petitions to wind up (Companies) — DANA RETAIL LTD (09876543)",
          url: "https://www.thegazette.co.uk/notice/demo-dana-winding-up",
          category: "Corporate Insolvency",
        },
      ];
    }
    return [];
  }
}
