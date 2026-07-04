import type {
  CompaniesHouseData,
  CompaniesHouseFlag,
  CompaniesHouseFiling,
  CompanyIntelPort,
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

  async lookupCompany(companyName: string): Promise<CompaniesHouseData | null> {
    const search = await this.get<{
      items?: { company_number: string; title: string }[];
    }>(`/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=1`);
    const hit = search?.items?.[0];
    if (!hit) return null;

    const num = hit.company_number;
    const [profile, filingHistory] = await Promise.all([
      this.get<ChProfile>(`/company/${num}`),
      this.get<ChFilingHistory>(`/company/${num}/filing-history?items_per_page=10`),
    ]);
    if (!profile) return null;

    return {
      companyNumber: num,
      companyName: profile.company_name ?? hit.title,
      status: profile.company_status ?? "unknown",
      incorporatedOn: profile.date_of_creation,
      flags: deriveFlags(profile),
      filings: (filingHistory?.items ?? []).map((f) => ({
        date: f.date,
        type: f.type,
        description: f.description,
        // The document API serves the filing PDF at document_metadata + /content.
        pdfUrl: f.links?.document_metadata ? `${f.links.document_metadata}/content` : undefined,
      })),
      profileUrl: `https://find-and-update.company-information.service.gov.uk/company/${num}`,
      lastChecked: new Date().toISOString().slice(0, 10),
    };
  }
}

interface ChProfile {
  company_name?: string;
  company_status?: string;
  date_of_creation?: string;
  accounts?: { overdue?: boolean };
  confirmation_statement?: { overdue?: boolean };
}
interface ChFilingHistory {
  items?: {
    date: string;
    type: string;
    description: string;
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
