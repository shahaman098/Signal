import type { ISODate } from "./types.js";

/**
 * Company intelligence — everything we know about a counterparty beyond Xero:
 * Companies House registry data (with filing PDFs) and financial news (with
 * source links). One CompanyContext per contact, persisted as a JSON file by
 * the API's context store so the agent always has full purchaser information
 * and reasoning data alongside the Xero numbers.
 */

export type CompanyRole = "customer" | "supplier" | "both";

/** Normalised red/green flags derived from Companies House data. */
export type CompaniesHouseFlag =
  | "accounts-overdue"
  | "confirmation-statement-overdue"
  | "gazette-strike-off-notice"
  | "liquidation"
  | "administration"
  | "receivership"
  | "dormant-filing"
  | "recent-officer-exodus"
  | "charge-registered" // new security granted over assets
  | "insolvency-history";

export interface CompaniesHouseFiling {
  date: ISODate;
  type: string; // e.g. "AA" (accounts), "GAZ1", "MR01" (charge)
  description: string;
  /** Direct link to the filing PDF via the CH document API. */
  pdfUrl?: string;
}

export interface CompaniesHouseData {
  companyNumber: string;
  companyName: string;
  status: string; // "active", "liquidation", "dissolved", ...
  incorporatedOn?: ISODate;
  flags: CompaniesHouseFlag[];
  filings: CompaniesHouseFiling[];
  /** Public profile page on find-and-update.company-information.service.gov.uk */
  profileUrl?: string;
  lastChecked: ISODate;
  /** Directors: how many active, how many resigned in the last 12 months. */
  officers?: { activeCount: number; resignedLast12m: number };
  /** Outstanding registered charges (security over assets). */
  chargesOutstanding?: number;
  /** Insolvency cases on record. */
  insolvencyCases?: number;
  /** Next accounts filing due — early warning before "overdue". */
  accountsNextDue?: ISODate;
}

/** How confident we are that the CH record belongs to this contact. */
export type MatchConfidence = "exact" | "probable" | "confirmed" | "none";

/** A search hit the human can confirm when no automatic match was safe. */
export interface CompanyCandidate {
  companyNumber: string;
  title: string;
  status?: string;
}

/** An official public-record notice from The Gazette (insolvency etc.). */
export interface GazetteNotice {
  date: ISODate;
  title: string;
  url: string;
  category?: string;
}

export type NewsSentiment = "positive" | "negative" | "neutral";

export interface NewsItem {
  date: ISODate;
  title: string;
  source: string; // publication name
  url: string; // source link
  sentiment: NewsSentiment;
  summary?: string;
}

/** The per-company context document (persisted as one JSON file per contact). */
export interface CompanyContext {
  contactId: string;
  companyName: string;
  role: CompanyRole;
  companyNumber?: string;
  /** How the CH record was matched; "confirmed" = human-pinned, never re-searched. */
  matchConfidence?: MatchConfidence;
  /** Top search hits when no automatic match was safe — for human confirmation. */
  chCandidates?: CompanyCandidate[];
  companiesHouse?: CompaniesHouseData;
  news: NewsItem[];
  /** Official public-record notices (The Gazette). */
  gazetteNotices?: GazetteNotice[];
  updatedAt: ISODate;
}

/** Flags that indicate financial distress (drive collection urgency / supplier risk). */
export const DISTRESS_FLAGS: readonly CompaniesHouseFlag[] = [
  "accounts-overdue",
  "confirmation-statement-overdue",
  "gazette-strike-off-notice",
  "liquidation",
  "administration",
  "receivership",
];

export function isDistressed(ctx: CompanyContext | undefined): boolean {
  if (!ctx?.companiesHouse) return false;
  return (ctx.companiesHouse.flags ?? []).some((f) => DISTRESS_FLAGS.includes(f));
}

export function recentPositiveNews(ctx: CompanyContext | undefined, asOf: ISODate, windowDays = 60): NewsItem[] {
  if (!ctx) return [];
  const cutoff = new Date(asOf).getTime() - windowDays * 24 * 60 * 60 * 1000;
  return (ctx.news ?? []).filter((n) => n.sentiment === "positive" && new Date(n.date).getTime() >= cutoff);
}
