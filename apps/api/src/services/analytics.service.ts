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
 */
export class AnalyticsService {
  private cache?: { at: number; snapshot: XeroSnapshot };

  constructor(
    private readonly xero: XeroPort,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getSnapshot(force = false): Promise<XeroSnapshot> {
    if (!force && this.cache && this.now() - this.cache.at < this.ttlMs) {
      return this.cache.snapshot;
    }
    const snapshot = await this.xero.snapshot();
    this.cache = { at: this.now(), snapshot };
    return snapshot;
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
}
