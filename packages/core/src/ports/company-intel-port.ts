import type { CompaniesHouseData, NewsItem } from "../domain/company.js";

/**
 * Ports for the company-intelligence side. Adapters in apps/api:
 *   CompaniesHouseAdapter → REST API + streaming API (real)
 *   FakeCompanyIntelAdapter / FakeNewsAdapter → canned demo intelligence
 */
export interface CompanyIntelPort {
  /** Look up a company's registry data by name (search → profile → filings). */
  lookupCompany(companyName: string): Promise<CompaniesHouseData | null>;
}

export interface NewsPort {
  /** Search recent financial news for a company. */
  searchCompanyNews(companyName: string, opts?: { sinceDays?: number }): Promise<NewsItem[]>;
}
