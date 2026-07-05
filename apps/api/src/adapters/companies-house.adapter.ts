import type {
  CompaniesHouseData,
  CompaniesHouseFlag,
  CompanyCandidate,
  CompanyIntelPort,
  CompanyLookupResult,
} from "@signal/core";

/**
 * Real Companies House adapter.
 *
 * REST:  https://api.company-information.service.gov.uk
 *   - GET /search/companies?q=            → resolve name → company number
 *   - GET /company/{number}               → profile (status, overdue flags)
 *   - GET /company/{number}/filing-history → filings; each item's
 *     links.document_metadata + "/content" is the PDF (via document API)
 *
 * STREAM: https://stream.companieshouse.gov.uk/companies
 *   Long-lived HTTP stream of newline-delimited JSON change events. We filter
 *   for tracked company numbers and invoke a callback so the ingestion layer
 *   can refresh that company's context file the moment something changes.
 *
 * Auth: API key as HTTP basic username (blank password) for both hosts.
 */

const REST_BASE = "https://api.company-information.service.gov.uk";
const STREAM_BASE = "https://stream.companieshouse.gov.uk";

export class CompaniesHouseAdapter implements CompanyIntelPort {
  constructor(private readonly apiKey: string) {}

  private headers(): Record<string, string> {
    return { Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}` };
  }

  private async get<T>(path: string): Promise<T | null> {
    const res = await fetch(`${REST_BASE}${path}`, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Companies House ${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  /**
   * Tiered lookup. Search is fuzzy ("Reliable Rita Ltd" happily returns "AEER
   * RITA CARE LTD"), and a wrong match could pin another company's distress
   * flags on a customer — so: exact-normalised name → auto; all-tokens-contained
   * → "probable"; anything else → candidates for a human to confirm.
   */
  async lookupCompany(companyName: string): Promise<CompanyLookupResult> {
    const search = await this.get<{
      items?: { company_number: string; title: string; company_status?: string }[];
    }>(`/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=10`);
    const items = search?.items ?? [];

    const exact = items.find((i) => namesMatch(companyName, i.title));
    const probable = exact ?? items.find((i) => probableMatch(companyName, i.title));
    if (probable) {
      const data = await this.lookupByNumber(probable.company_number);
      if (data) return { confidence: exact ? "exact" : "probable", data };
    }

    const candidates: CompanyCandidate[] = items.slice(0, 3).map((i) => ({
      companyNumber: i.company_number,
      title: i.title,
      status: i.company_status,
    }));
    return { confidence: "none", candidates };
  }

  /** Full fetch by registration number: profile, filings, officers, charges, insolvency. */
  async lookupByNumber(num: string): Promise<CompaniesHouseData | null> {
    const [profile, filingHistory, officers, charges, insolvency] = await Promise.all([
      this.get<ChProfile>(`/company/${num}`),
      this.get<ChFilingHistory>(`/company/${num}/filing-history?items_per_page=10`),
      this.get<ChOfficers>(`/company/${num}/officers?items_per_page=50`).catch(() => null),
      this.get<ChCharges>(`/company/${num}/charges`).catch(() => null),
      this.get<ChInsolvency>(`/company/${num}/insolvency`).catch(() => null),
    ]);
    if (!profile) return null;

    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const officerItems = officers?.items ?? [];
    const activeCount = officerItems.filter((o) => !o.resigned_on).length;
    const resignedLast12m = officerItems.filter((o) => o.resigned_on && o.resigned_on >= yearAgo).length;

    const sixMonthsAgo = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
    const chargeItems = charges?.items ?? [];
    const chargesOutstanding = chargeItems.filter((c) => c.status === "outstanding").length;
    const recentCharge = chargeItems.some(
      (c) => c.status === "outstanding" && (c.created_on ?? "") >= sixMonthsAgo,
    );
    const insolvencyCases = insolvency?.cases?.length ?? 0;

    const flags = deriveFlags(profile);
    if (resignedLast12m >= 2) flags.push("recent-officer-exodus");
    if (recentCharge) flags.push("charge-registered");
    if (insolvencyCases > 0) flags.push("insolvency-history");

    return {
      companyNumber: num,
      companyName: profile.company_name ?? num,
      status: profile.company_status ?? "unknown",
      incorporatedOn: profile.date_of_creation,
      flags,
      filings: (filingHistory?.items ?? []).map((f) => ({
        date: f.date,
        type: f.type,
        description: humaniseFiling(f),
        // Human-clickable filing PDF via the public site's document route (302s
        // to a signed PDF). Only emitted when the filing actually HAS a document
        // (document_metadata present) — linking docless filings just errors.
        pdfUrl:
          f.transaction_id && f.links?.document_metadata
            ? `${PUBLIC_BASE}/company/${num}/filing-history/${f.transaction_id}/document?format=pdf&download=0`
            : undefined,
      })),
      profileUrl: `${PUBLIC_BASE}/company/${num}`,
      lastChecked: new Date().toISOString().slice(0, 10),
      officers: { activeCount, resignedLast12m },
      chargesOutstanding,
      insolvencyCases,
      accountsNextDue: profile.accounts?.next_due,
    };
  }
}

const PUBLIC_BASE = "https://find-and-update.company-information.service.gov.uk";

/**
 * Registered-name equality, tolerant of legal-suffix and punctuation variants:
 * "Dana Retail Ltd" === "DANA RETAIL LIMITED" — but "Reliable Rita Ltd" !==
 * "AEER RITA CARE LTD".
 */
export function namesMatch(a: string, b: string): boolean {
  return normaliseCompanyName(a) === normaliseCompanyName(b);
}

/**
 * "Probable" tier: every meaningful token of the contact's name appears in the
 * registered title (≥2 tokens, so single-word names can't false-positive).
 * "Hamilton Smith Ltd" ≈ "HAMILTON SMITH CONSULTING LIMITED" → probable.
 * "Reliable Rita Ltd" vs "AEER RITA CARE LTD" → only 1 of 2 tokens → no.
 */
export function probableMatch(query: string, title: string): boolean {
  const queryTokens = normaliseCompanyName(query)
    .split(" ")
    .filter((t) => t.length > 1 && !["LTD", "PLC", "LLP", "THE"].includes(t));
  if (queryTokens.length < 2) return false;
  const titleTokens = new Set(normaliseCompanyName(title).split(" "));
  return queryTokens.every((t) => titleTokens.has(t));
}

function normaliseCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,'()&]/g, " ")
    .replace(/\bLIMITED\b/g, "LTD")
    .replace(/\bPUBLIC LIMITED COMPANY\b/g, "PLC")
    .replace(/\bLIMITED LIABILITY PARTNERSHIP\b/g, "LLP")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Filing descriptions arrive as enum slugs ("appoint-person-director-company-
 * with-name-date") plus description_values. Render something readable.
 */
function humaniseFiling(f: {
  description: string;
  description_values?: Record<string, string>;
}): string {
  const words = f.description.replace(/-/g, " ").replace(/\bwith name date\b/, "").trim();
  const values = Object.values(f.description_values ?? {}).join(", ");
  const text = words.charAt(0).toUpperCase() + words.slice(1);
  return values ? `${text} — ${values}` : text;
}

interface ChProfile {
  company_name?: string;
  company_status?: string;
  date_of_creation?: string;
  accounts?: { overdue?: boolean; next_due?: string };
  confirmation_statement?: { overdue?: boolean };
}
interface ChOfficers {
  items?: { name?: string; resigned_on?: string }[];
}
interface ChCharges {
  items?: { status?: string; created_on?: string }[];
}
interface ChInsolvency {
  cases?: { type?: string }[];
}
interface ChFilingHistory {
  items?: {
    date: string;
    type: string;
    description: string;
    description_values?: Record<string, string>;
    transaction_id?: string;
    links?: { document_metadata?: string };
  }[];
}

function deriveFlags(profile: ChProfile): CompaniesHouseFlag[] {
  const flags: CompaniesHouseFlag[] = [];
  if (profile.accounts?.overdue) flags.push("accounts-overdue");
  if (profile.confirmation_statement?.overdue) flags.push("confirmation-statement-overdue");
  const status = (profile.company_status ?? "").toLowerCase();
  if (status.includes("liquidation")) flags.push("liquidation");
  if (status.includes("administration")) flags.push("administration");
  if (status.includes("receivership")) flags.push("receivership");
  return flags;
}

// ---- Streaming ----

export interface ChStreamEvent {
  companyNumber: string;
  raw: unknown;
}

/**
 * Companies House streaming client. Connects to the /companies firehose,
 * filters events down to the company numbers we track, and invokes the
 * callback so the ingestion service can refresh that company's context.
 * Reconnects with exponential backoff. Fire-and-forget: call start(), stop().
 */
export class CompaniesHouseStream {
  private abort?: AbortController;
  private stopped = false;

  constructor(
    private readonly apiKey: string,
    private readonly trackedNumbers: () => Set<string>,
    private readonly onEvent: (event: ChStreamEvent) => void,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  start(): void {
    this.stopped = false;
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.abort?.abort();
  }

  private async loop(): Promise<void> {
    let backoffMs = 1_000;
    while (!this.stopped) {
      try {
        this.abort = new AbortController();
        const res = await fetch(`${STREAM_BASE}/companies`, {
          headers: { Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}` },
          signal: this.abort.signal,
        });
        if (res.status === 401 || res.status === 403) {
          // Auth failures don't heal with retries — CH streaming needs its own
          // key (distinct from the REST key). Stop cleanly.
          this.log(
            `[ch-stream] key rejected (${res.status}) — streaming disabled. ` +
              "Create a 'Stream' type key in the CH developer hub and set COMPANIES_HOUSE_STREAM_KEY.",
          );
          this.stopped = true;
          return;
        }
        if (!res.ok || !res.body) throw new Error(`stream connect → ${res.status}`);
        this.log("[ch-stream] connected");
        backoffMs = 1_000;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const lineText = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!lineText) continue; // heartbeat
            try {
              const event = JSON.parse(lineText) as { data?: { company_number?: string } };
              const num = event.data?.company_number;
              if (num && this.trackedNumbers().has(num)) {
                this.onEvent({ companyNumber: num, raw: event });
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } catch (err) {
        if (this.stopped) return;
        this.log(`[ch-stream] disconnected (${err instanceof Error ? err.message : err}); retrying in ${backoffMs}ms`);
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 60_000);
      }
    }
  }
}
