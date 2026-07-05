import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  agedReceivableSchema,
  contactSchema,
  invoiceSchema,
  paymentSchema,
  type AgedReceivable,
  type Bill,
  type Contact,
  type CreateInvoiceDraftInput,
  type CreatePaymentInput,
  type CreateQuoteInput,
  type Invoice,
  type LineItem,
  type Payment,
  type Supplier,
  type XeroPort,
  type XeroSnapshot,
} from "@signal/core";

/**
 * Real Xero adapter over the official MCP server (@xeroapi/xero-mcp-server).
 *
 * The server's tools return FORMATTED TEXT blocks ("Contact: Acme\nID: …"),
 * not JSON — verified against the server source. This adapter is therefore a
 * text-protocol client: every list tool yields one header block ("Found N …")
 * followed by one key/value block per record, which parseKV() decodes.
 *
 * Wire facts this file encodes (all read from the server source):
 *  - list-invoices: `page` REQUIRED, 10/page; line items ONLY returned when
 *    filtering by invoiceNumbers; ACCPAY invoices are bills.
 *  - list-contacts: 100/page; "Type: Customer, Supplier" line identifies role.
 *  - list-payments: `page` defaults 1; nested "  Invoice ID:" line links the invoice.
 *  - aged receivables exists only per-contact (list-aged-receivables-by-contact),
 *    so snapshot() computes aged buckets from invoices instead — same numbers,
 *    zero extra round-trips.
 *  - create-quote / create-invoice line items REQUIRE accountCode + taxType.
 *  - create-invoice is hardwired to DRAFT status by the server (matches our
 *    "draft only" policy).
 */

const TOOLS = {
  listContacts: "list-contacts",
  listInvoices: "list-invoices",
  listPayments: "list-payments",
  createQuote: "create-quote",
  createInvoice: "create-invoice",
  createPayment: "create-payment",
} as const;

const INVOICES_PER_PAGE = 10;
const CONTACTS_PER_PAGE = 100;
/** How many recent invoices get a second pass to fetch line items. */
const LINEITEM_INVOICE_LIMIT = Number(process.env.XERO_LINEITEM_INVOICES ?? 60);
const DEFAULT_ACCOUNT_CODE = process.env.XERO_DEFAULT_ACCOUNT_CODE ?? "200";
const DEFAULT_TAX_TYPE = process.env.XERO_DEFAULT_TAX_TYPE ?? "NONE";
const MAX_PAGES = 200; // hard stop against runaway pagination

export interface XeroMcpOptions {
  command: string;
  args: string[];
  clientId: string;
  clientSecret: string;
}

export class XeroMcpAdapter implements XeroPort {
  private client?: Client;
  private connecting?: Promise<Client>;

  constructor(private readonly opts: XeroMcpOptions) {}

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const transport = new StdioClientTransport({
        command: this.opts.command,
        args: this.opts.args,
        env: {
          ...process.env,
          XERO_CLIENT_ID: this.opts.clientId,
          XERO_CLIENT_SECRET: this.opts.clientSecret,
        } as Record<string, string>,
      });
      const client = new Client({ name: "signal-api", version: "0.1.0" }, { capabilities: {} });
      await client.connect(transport);
      this.client = client;
      return client;
    })();

    return this.connecting;
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.connecting = undefined;
  }

  /** Call a tool and return its text blocks. Throws on tool-reported errors. */
  private async callBlocks(name: string, args: Record<string, unknown> = {}): Promise<string[]> {
    const client = await this.getClient();
    const result = (await client.callTool({ name, arguments: args })) as {
      content?: { type: string; text?: string }[];
      isError?: boolean;
    };
    const blocks = (result.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text!.trim())
      .filter(Boolean);
    const failure = result.isError || blocks[0]?.startsWith("Error");
    if (failure) {
      throw new Error(`Xero MCP tool "${name}" failed: ${blocks.join(" ").slice(0, 400)}`);
    }
    return blocks;
  }

  // ---- Reads ----

  async listContacts(): Promise<Contact[]> {
    const contacts: Contact[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const blocks = await this.callBlocks(TOOLS.listContacts, { page });
      const records = blocks.slice(1); // block 0 is "Found N contacts…"
      for (const block of records) {
        const kv = parseKV(block);
        const c = parseContact(kv);
        if (c) contacts.push(contactSchema.parse(c));
      }
      if (records.length < CONTACTS_PER_PAGE) break;
    }
    return contacts;
  }

  /** Sales invoices (ACCREC). Line items enriched for the most recent ones. */
  async listInvoices(): Promise<Invoice[]> {
    const { accrec } = await this.listAllInvoices();
    await this.enrichLineItems(accrec);
    return accrec.map((i) => invoiceSchema.parse(i));
  }

  async listPayments(): Promise<Payment[]> {
    const payments: Payment[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const blocks = await this.callBlocks(TOOLS.listPayments, { page });
      const records = blocks.slice(1);
      for (const block of records) {
        const kv = parseKV(block);
        const p = parsePayment(kv);
        if (p) payments.push(paymentSchema.parse(p));
      }
      if (records.length < INVOICES_PER_PAGE) break;
    }
    return payments;
  }

  /**
   * Aged receivables, computed from open invoices. (The MCP server only offers
   * a per-contact report tool returning raw report-row JSON; deriving the
   * buckets locally gives identical numbers without N round-trips.)
   */
  async getAgedReceivables(): Promise<AgedReceivable[]> {
    const { accrec } = await this.listAllInvoices();
    return computeAgedFromInvoices(accrec, today()).map((a) => agedReceivableSchema.parse(a));
  }

  async snapshot(): Promise<XeroSnapshot> {
    const [contacts, invoicesSplit, payments] = await Promise.all([
      this.listContacts(),
      this.listAllInvoices(),
      this.listPayments(),
    ]);
    const { accrec, accpay } = invoicesSplit;
    await this.enrichLineItems(accrec);
    const asOf = today();

    return {
      asOf,
      contacts,
      invoices: accrec.map((i) => invoiceSchema.parse(i)),
      payments,
      agedReceivables: computeAgedFromInvoices(accrec, asOf),
      bills: accpay.map(accpayToBill),
      suppliers: suppliersFrom(contacts, accpay),
    };
  }

  /** One paginated sweep, split into sales invoices (ACCREC) and bills (ACCPAY). */
  private async listAllInvoices(): Promise<{ accrec: Invoice[]; accpay: Invoice[] }> {
    const accrec: Invoice[] = [];
    const accpay: Invoice[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const blocks = await this.callBlocks(TOOLS.listInvoices, { page });
      const records = blocks.slice(1);
      for (const block of records) {
        const kv = parseKV(block);
        const inv = parseInvoice(kv);
        if (!inv) continue;
        (kv["Type"] === "ACCPAY" ? accpay : accrec).push(inv);
      }
      if (records.length < INVOICES_PER_PAGE) break;
    }
    return { accrec, accpay };
  }

  /**
   * Second pass: line items only arrive when filtering by invoiceNumbers, so
   * fetch them for the most recent LINEITEM_INVOICE_LIMIT invoices in chunks.
   */
  private async enrichLineItems(invoices: Invoice[]): Promise<void> {
    const byNumber = new Map(
      invoices.filter((i) => i.invoiceNumber).map((i) => [i.invoiceNumber!, i]),
    );
    const targets = [...invoices]
      .filter((i) => i.invoiceNumber && i.status !== "DELETED" && i.status !== "VOIDED")
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))
      .slice(0, LINEITEM_INVOICE_LIMIT)
      .map((i) => i.invoiceNumber!);

    for (let at = 0; at < targets.length; at += INVOICES_PER_PAGE) {
      const chunk = targets.slice(at, at + INVOICES_PER_PAGE);
      const blocks = await this.callBlocks(TOOLS.listInvoices, { page: 1, invoiceNumbers: chunk });
      for (const block of blocks.slice(1)) {
        const kv = parseKV(block);
        const number = kv["Invoice"];
        const target = number ? byNumber.get(number) : undefined;
        if (target) target.lineItems = parseLineItems(block);
      }
    }
  }

  // ---- Writes ----

  async createQuote(input: CreateQuoteInput): Promise<{ quoteId: string; deepLink?: string }> {
    const blocks = await this.callBlocks(TOOLS.createQuote, {
      contactId: input.contactId,
      lineItems: input.lineItems.map(toWireLineItem),
      reference: input.reference,
      summary: input.summary,
    });
    return { quoteId: extractId(blocks), deepLink: extractDeepLink(blocks) };
  }

  async createInvoiceDraft(
    input: CreateInvoiceDraftInput,
  ): Promise<{ invoiceId: string; deepLink?: string }> {
    // The MCP server hardwires DRAFT status — our "never auto-authorise" policy.
    const blocks = await this.callBlocks(TOOLS.createInvoice, {
      contactId: input.contactId,
      lineItems: input.lineItems.map(toWireLineItem),
      type: "ACCREC",
      reference: input.reference,
    });
    return { invoiceId: extractId(blocks), deepLink: extractDeepLink(blocks) };
  }

  async createPayment(input: CreatePaymentInput): Promise<{ paymentId: string; deepLink?: string }> {
    const blocks = await this.callBlocks(TOOLS.createPayment, {
      invoiceId: input.invoiceId,
      accountId: input.accountId,
      amount: input.amount,
      date: input.date,
    });
    return { paymentId: extractId(blocks), deepLink: extractDeepLink(blocks) };
  }
}

// ============================================================================
// Text-format parsers (exported for unit tests)
// ============================================================================

/** "Key: Value" lines (indentation-tolerant) → record. First occurrence wins. */
export function parseKV(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    const idx = line.indexOf(": ");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 2).trim();
    if (!(key in out)) out[key] = value;
  }
  return out;
}

export function parseContact(kv: Record<string, string>): Contact | null {
  const contactId = kv["ID"];
  const name = kv["Contact"];
  if (!contactId || !name) return null;
  const email = kv["Email"] && kv["Email"] !== "No email" ? kv["Email"] : undefined;
  return { contactId, name, email };
}

/** "Contact: Acme Ltd (abc-123)" → "abc-123" */
export function contactIdFrom(line: string | undefined): string {
  const m = line?.match(/\(([^()]+)\)\s*$/);
  return m?.[1] ?? "";
}

export function parseInvoice(kv: Record<string, string>): Invoice | null {
  const invoiceId = kv["Invoice ID"];
  if (!invoiceId) return null;
  const status = (kv["Status"] ?? "").toUpperCase() as Invoice["status"];
  if (!["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED", "DELETED"].includes(status)) {
    return null;
  }
  return {
    invoiceId,
    invoiceNumber: kv["Invoice"] || undefined,
    contactId: contactIdFrom(kv["Contact"]),
    status,
    issueDate: toIsoDate(kv["Date"]),
    dueDate: toIsoDate(kv["Due Date"]) || toIsoDate(kv["Date"]),
    total: num(kv["Total"]),
    // The formatter omits falsy fields — absent means 0.
    amountDue: num(kv["Amount Due"]),
    amountPaid: num(kv["Amount Paid"]),
    currencyCode: kv["Currency"] || undefined,
    lineItems: [],
  };
}

export function parsePayment(kv: Record<string, string>): Payment | null {
  const paymentId = kv["Payment ID"];
  const invoiceId = kv["Invoice ID"]; // nested under "Invoice:" but parseKV trims
  if (!paymentId || !invoiceId || paymentId === "Unknown") return null;
  return {
    paymentId,
    invoiceId,
    date: toIsoDate(kv["Date"]),
    amount: num(kv["Amount"]),
  };
}

/**
 * Line items arrive as "Line Items: <item>,<item>" where each item is the
 * multi-line format-line-item output starting "Item ID: …".
 */
export function parseLineItems(block: string): LineItem[] {
  const start = block.indexOf("Line Items:");
  if (start < 0) return [];
  const body = block.slice(start + "Line Items:".length);
  return body
    .split(/,(?=\s*Item ID:)/)
    .map((segment) => parseKV(segment))
    .filter((kv) => kv["Description"] || kv["Item Code"])
    .map((kv) => ({
      description: clean(kv["Description"]) ?? "",
      quantity: num(kv["Quantity"], 1),
      unitAmount: num(kv["Unit Amount"]),
      lineAmount: num(kv["Line Amount"]),
      accountCode: clean(kv["Account Code"]),
      itemCode: clean(kv["Item Code"]),
    }));
}

/** Aged-receivable buckets derived from open ACCREC invoices. */
export function computeAgedFromInvoices(invoices: Invoice[], asOf: string): AgedReceivable[] {
  const buckets = new Map<string, AgedReceivable>();
  const asOfMs = new Date(asOf).getTime();
  for (const inv of invoices) {
    if (inv.amountDue <= 0.005) continue;
    if (inv.status !== "AUTHORISED" && inv.status !== "SUBMITTED") continue;
    let b = buckets.get(inv.contactId);
    if (!b) {
      b = { contactId: inv.contactId, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, older: 0, total: 0 };
      buckets.set(inv.contactId, b);
    }
    const overdueDays = Math.floor((asOfMs - new Date(inv.dueDate).getTime()) / 86_400_000);
    if (overdueDays <= 0) b.current += inv.amountDue;
    else if (overdueDays <= 30) b.days1to30 += inv.amountDue;
    else if (overdueDays <= 60) b.days31to60 += inv.amountDue;
    else if (overdueDays <= 90) b.days61to90 += inv.amountDue;
    else b.older += inv.amountDue;
    b.total += inv.amountDue;
  }
  return [...buckets.values()];
}

// ---- helpers ----

function accpayToBill(inv: Invoice): Bill {
  return {
    billId: inv.invoiceId,
    supplierId: inv.contactId,
    supplierName: "", // filled by suppliersFrom join below when known
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    total: inv.total,
    amountDue: inv.amountDue,
    status: inv.status === "PAID" ? "PAID" : inv.status === "VOIDED" ? "VOIDED" : inv.status === "DRAFT" ? "DRAFT" : "AUTHORISED",
  };
}

function suppliersFrom(contacts: Contact[], accpay: Invoice[]): Supplier[] {
  const supplierIds = new Set(accpay.map((i) => i.contactId).filter(Boolean));
  return contacts
    .filter((c) => supplierIds.has(c.contactId))
    .map((c) => ({ supplierId: c.contactId, name: c.name, contactId: c.contactId }));
}

function toWireLineItem(li: LineItem) {
  return {
    description: li.description,
    quantity: li.quantity,
    unitAmount: li.unitAmount,
    accountCode: li.accountCode ?? DEFAULT_ACCOUNT_CODE,
    taxType: DEFAULT_TAX_TYPE,
  };
}

/** Created-object responses contain an "ID: <guid>" line. */
function extractId(blocks: string[]): string {
  for (const block of blocks) {
    const id = parseKV(block)["ID"];
    if (id) return id;
  }
  return "";
}

/** …and a "Link to view: <url>" deep link into Xero. */
function extractDeepLink(blocks: string[]): string | undefined {
  for (const block of blocks) {
    const link = parseKV(block)["Link to view"];
    if (link?.startsWith("http")) return link;
  }
  return undefined;
}

function num(v: string | undefined, fallback = 0): number {
  if (v === undefined) return fallback;
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function clean(v: string | undefined): string | undefined {
  return v === undefined || v === "undefined" || v === "Unknown" ? undefined : v;
}

/** Xero dates arrive as "2026-06-15" or ISO datetimes — normalise to date. */
function toIsoDate(v: string | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
