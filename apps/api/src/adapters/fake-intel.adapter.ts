import {
  makeDemoCompanyContexts,
  type CompaniesHouseData,
  type CompanyIntelPort,
  type NewsItem,
  type NewsPort,
} from "@signal/core";

/**
 * Fake company-intelligence adapters, keyed off the demo contexts. Companies we
 * "know" return their canned Companies House data / news; anything else gets a
 * clean, empty profile — so ingestion always succeeds offline.
 */

const contexts = makeDemoCompanyContexts();
const byName = new Map(contexts.map((c) => [c.companyName.toLowerCase(), c]));

export class FakeCompanyIntelAdapter implements CompanyIntelPort {
  async lookupCompany(companyName: string): Promise<CompaniesHouseData | null> {
    const known = byName.get(companyName.toLowerCase());
    if (known?.companiesHouse) return known.companiesHouse;
    return null; // unknown to the registry — context will simply lack CH data
  }
}

export class FakeNewsAdapter implements NewsPort {
  async searchCompanyNews(companyName: string): Promise<NewsItem[]> {
    return byName.get(companyName.toLowerCase())?.news ?? [];
  }
}
