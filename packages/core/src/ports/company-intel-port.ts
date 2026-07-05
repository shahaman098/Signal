import type {
  CompaniesHouseData,
  CompanyCandidate,
  GazetteNotice,
  MatchConfidence,
  NewsItem,
} from "../domain/company.js";

/**
 * Ports for the company-intelligence side. Adapters in apps/api:
 *   CompaniesHouseAdapter → REST API + streaming API (real)
 *   GazetteAdapter        → The Gazette official public record (keyless)
 *   Composite/RSS/GDELT/NewsAPI news adapters
 *   Fake* variants        → canned demo intelligence
 */

/** Outcome of a registry lookup: a safe match, or candidates for a human to confirm. */
export interface CompanyLookupResult {
  confidence: MatchConfidence;
  data?: CompaniesHouseData; // present when confidence is exact/probable/confirmed
  candidates?: CompanyCandidate[]; // present when confidence is "none"
}

export interface CompanyIntelPort {
  /** Look up a company by name: tiered matching (exact → probable → candidates). */
  lookupCompany(companyName: string): Promise<CompanyLookupResult>;
  /** Fetch a specific company by registration number (human-confirmed pins). */
  lookupByNumber?(companyNumber: string): Promise<CompaniesHouseData | null>;
}

export interface NewsPort {
  /** Search recent financial news for a company. */
  searchCompanyNews(companyName: string, opts?: { sinceDays?: number }): Promise<NewsItem[]>;
}

export interface GazettePort {
  /** Official public-record notices (insolvency, strike-off) mentioning the company. */
  searchNotices(companyName: string): Promise<GazetteNotice[]>;
}
