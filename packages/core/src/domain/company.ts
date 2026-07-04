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
  | "charge-registered"; // new security granted over assets

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
  companiesHouse?: CompaniesHouseData;
  news: NewsItem[];
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
  return ctx.companiesHouse.flags.some((f) => DISTRESS_FLAGS.includes(f));
}

export function recentPositiveNews(ctx: CompanyContext | undefined, asOf: ISODate, windowDays = 60): NewsItem[] {
  if (!ctx) return [];
  const cutoff = new Date(asOf).getTime() - windowDays * 24 * 60 * 60 * 1000;
  return ctx.news.filter((n) => n.sentiment === "positive" && new Date(n.date).getTime() >= cutoff);
}
