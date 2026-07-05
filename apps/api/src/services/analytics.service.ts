import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildReceivablesReport,
  type Contact,
  type ReceivablesReport,
  type XeroPort,
  type XeroSnapshot,
} from "@signal/core";

/**
 * Reads a snapshot from Xero (through whatever XeroPort is wired) and runs the
 * analysis layer over it. Snapshots are cached briefly so a dashboard hitting
 * several endpoints doesn't re-pull Xero on every request.
 *
 * Resilience: every successful snapshot is also persisted to disk, and when a
 * fresh pull fails (Xero daily rate limit, network, MCP hiccup) the service
 * serves the last-known snapshot — stale data beats a dead dashboard.
 */
export class AnalyticsService {
  private cache?: { at: number; snapshot: XeroSnapshot };
  private inflight?: Promise<XeroSnapshot>;
  /** Set when the latest pull failed and we're serving last-known data. */
  staleSince?: string;

  constructor(
    private readonly xero: XeroPort,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = () => Date.now(),
    private readonly diskCachePath?: string,
  ) {}

  async getSnapshot(force = false): Promise<XeroSnapshot> {
    if (!force && this.cache && this.now() - this.cache.at < this.ttlMs) {
      return this.cache.snapshot;
    }
    // Dedupe concurrent callers: a dashboard load fires several endpoints at
    // once, and against real Xero a snapshot is many paginated MCP calls —
    // parallel sweeps waste rate limit and can fail under contention.
    if (this.inflight) return this.inflight;
    this.inflight = this.xero
      .snapshot()
      .then(async (snapshot) => {
        this.cache = { at: this.now(), snapshot };
        this.staleSince = undefined;
        await this.persistToDisk(snapshot);
        return snapshot;
      })
      .catch(async (err: unknown) => {
        const fallback = this.cache?.snapshot ?? (await this.loadFromDisk());
        if (fallback) {
          // Serve stale rather than failing; remember why.
          this.staleSince = this.staleSince ?? new Date().toISOString();
          this.cache = this.cache ?? { at: 0, snapshot: fallback };
          console.warn(
            `[analytics] snapshot refresh failed (${err instanceof Error ? err.message.slice(0, 120) : err}); serving last-known data`,
          );
          return fallback;
        }
        throw err;
      })
      .finally(() => (this.inflight = undefined));
    return this.inflight;
  }

  async getReport(force = false): Promise<ReceivablesReport> {
    return buildReceivablesReport(await this.getSnapshot(force));
  }

  async getContacts(): Promise<Contact[]> {
    return (await this.getSnapshot()).contacts;
  }

  async findContact(contactId: string): Promise<Contact | undefined> {
    return (await this.getSnapshot()).contacts.find((c) => c.contactId === contactId);
  }

  async findInvoice(invoiceId: string) {
    return (await this.getSnapshot()).invoices.find((i) => i.invoiceId === invoiceId);
  }

  invalidate(): void {
    this.cache = undefined;
  }

  // ---- last-known-snapshot disk cache ----

  private async persistToDisk(snapshot: XeroSnapshot): Promise<void> {
    if (!this.diskCachePath) return;
    try {
      await mkdir(dirname(this.diskCachePath), { recursive: true });
      await writeFile(this.diskCachePath, JSON.stringify(snapshot), "utf8");
    } catch {
      // best-effort cache; never fail the request over it
    }
  }

  private async loadFromDisk(): Promise<XeroSnapshot | null> {
    if (!this.diskCachePath) return null;
    try {
      return JSON.parse(await readFile(this.diskCachePath, "utf8")) as XeroSnapshot;
    } catch {
      return null;
    }
  }
}
