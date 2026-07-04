import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  agedReceivableSchema,
  contactSchema,
  invoiceSchema,
  paymentSchema,
  type AgedReceivable,
  type Contact,
  type CreateInvoiceDraftInput,
  type CreatePaymentInput,
  type CreateQuoteInput,
  type Invoice,
  type Payment,
  type XeroPort,
  type XeroSnapshot,
} from "@signal/core";
import { z } from "zod";

/**
 * Real Xero adapter that talks to the Xero MCP server (@xeroapi/xero-mcp-server)
 * over stdio. The MCP tool *names* and their JSON payloads are the integration
 * seam: they're isolated in TOOLS + the map* helpers below so that if Xero's MCP
 * surface changes, nothing outside this file needs to.
 *
 * Every tool result is validated through the core Zod schemas before leaving the
 * adapter, so malformed data fails at the boundary rather than in the analysis
 * layer.
 */

// Tool names exposed by the Xero MCP server. Adjust here if the server renames them.
const TOOLS = {
  listContacts: "list-contacts",
  listInvoices: "list-invoices",
  listPayments: "list-payments",
  agedReceivables: "list-aged-receivables-report",
  createQuote: "create-quote",
  createInvoice: "create-invoice",
  createPayment: "create-payment",
} as const;

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

  /** Lazily connect (and reuse) a single MCP session. */
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
      const client = new Client(
        { name: "signal-api", version: "0.1.0" },
        { capabilities: {} },
      );
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

  /** Call a tool and parse its text content as JSON. */
  private async call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const client = await this.getClient();
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) {
      throw new Error(`Xero MCP tool "${name}" failed: ${extractText(result)}`);
    }
    const text = extractText(result);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Xero MCP tool "${name}" returned non-JSON output`);
    }
  }

  async listContacts(): Promise<Contact[]> {
    const raw = await this.call<unknown[]>(TOOLS.listContacts);
    return arrayOf(raw).map(mapContact).map((c) => contactSchema.parse(c));
  }

  async listInvoices(opts?: { modifiedSince?: string }): Promise<Invoice[]> {
    const raw = await this.call<unknown[]>(TOOLS.listInvoices, {
      modifiedSince: opts?.modifiedSince,
    });
    return arrayOf(raw).map(mapInvoice).map((i) => invoiceSchema.parse(i));
  }

  async listPayments(): Promise<Payment[]> {
    const raw = await this.call<unknown[]>(TOOLS.listPayments);
    return arrayOf(raw).map(mapPayment).map((p) => paymentSchema.parse(p));
  }

  async getAgedReceivables(): Promise<AgedReceivable[]> {
    const raw = await this.call<unknown[]>(TOOLS.agedReceivables);
    return arrayOf(raw).map(mapAgedReceivable).map((a) => agedReceivableSchema.parse(a));
  }

  async snapshot(): Promise<XeroSnapshot> {
    const [contacts, invoices, payments, agedReceivables] = await Promise.all([
      this.listContacts(),
      this.listInvoices(),
      this.listPayments(),
      this.getAgedReceivables(),
    ]);
    return {
      asOf: new Date().toISOString().slice(0, 10),
      contacts,
      invoices,
      payments,
      agedReceivables,
    };
  }

  async createQuote(input: CreateQuoteInput): Promise<{ quoteId: string }> {
    const res = await this.call<{ quoteID?: string; quoteId?: string }>(TOOLS.createQuote, {
      contactId: input.contactId,
      reference: input.reference,
      summary: input.summary,
      expiryDate: input.expiryDate,
      lineItems: input.lineItems,
    });
    return { quoteId: res.quoteId ?? res.quoteID ?? "" };
  }

  async createInvoiceDraft(input: CreateInvoiceDraftInput): Promise<{ invoiceId: string }> {
    const res = await this.call<{ invoiceID?: string; invoiceId?: string }>(TOOLS.createInvoice, {
      contactId: input.contactId,
      reference: input.reference,
      dueDate: input.dueDate,
      lineItems: input.lineItems,
      status: "DRAFT", // never auto-authorise
    });
    return { invoiceId: res.invoiceId ?? res.invoiceID ?? "" };
  }

  async createPayment(input: CreatePaymentInput): Promise<{ paymentId: string }> {
    const res = await this.call<{ paymentID?: string; paymentId?: string }>(TOOLS.createPayment, {
      invoiceId: input.invoiceId,
      accountId: input.accountId,
      date: input.date,
      amount: input.amount,
    });
    return { paymentId: res.paymentId ?? res.paymentID ?? "" };
  }
}

// ---- MCP result helpers ----

const mcpResultSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  isError: z.boolean().optional(),
});

function extractText(result: unknown): string {
  const parsed = mcpResultSchema.safeParse(result);
  if (!parsed.success) return "";
  return (parsed.data.content ?? [])
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
}

/** Xero MCP tools sometimes wrap arrays in an envelope; normalise to an array. */
function arrayOf(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    for (const key of ["items", "data", "Invoices", "Contacts", "Payments"]) {
      const v = (raw as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

// ---- Field mapping: Xero wire format → domain shape ----
// Xero returns PascalCase keys (InvoiceID, ...). These readers accept either
// case so the adapter is resilient to formatting differences.

const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};
const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

function mapContact(o: Record<string, unknown>): Contact {
  return {
    contactId: str(pick(o, "contactId", "ContactID")),
    name: str(pick(o, "name", "Name")),
    email: (pick(o, "email", "EmailAddress") as string | undefined) || undefined,
  };
}

function mapInvoice(o: Record<string, unknown>): Invoice {
  const contact = (pick(o, "contact", "Contact") as Record<string, unknown>) ?? {};
  const lines = (pick(o, "lineItems", "LineItems") as Record<string, unknown>[]) ?? [];
  return {
    invoiceId: str(pick(o, "invoiceId", "InvoiceID")),
    invoiceNumber: (pick(o, "invoiceNumber", "InvoiceNumber") as string | undefined) || undefined,
    contactId: str(pick(o, "contactId", "ContactID") ?? pick(contact, "contactId", "ContactID")),
    status: str(pick(o, "status", "Status")).toUpperCase() as Invoice["status"],
    issueDate: str(pick(o, "issueDate", "date", "Date", "DateString")),
    dueDate: str(pick(o, "dueDate", "DueDate", "DueDateString")),
    total: num(pick(o, "total", "Total")),
    amountDue: num(pick(o, "amountDue", "AmountDue")),
    amountPaid: num(pick(o, "amountPaid", "AmountPaid")),
    currencyCode: (pick(o, "currencyCode", "CurrencyCode") as string | undefined) || undefined,
    lineItems: lines.map(mapLineItem),
  };
}

function mapLineItem(o: Record<string, unknown>) {
  return {
    description: str(pick(o, "description", "Description")),
    quantity: num(pick(o, "quantity", "Quantity")),
    unitAmount: num(pick(o, "unitAmount", "UnitAmount")),
    lineAmount: num(pick(o, "lineAmount", "LineAmount")),
    accountCode: (pick(o, "accountCode", "AccountCode") as string | undefined) || undefined,
    itemCode: (pick(o, "itemCode", "ItemCode") as string | undefined) || undefined,
  };
}

function mapPayment(o: Record<string, unknown>): Payment {
  const invoice = (pick(o, "invoice", "Invoice") as Record<string, unknown>) ?? {};
  return {
    paymentId: str(pick(o, "paymentId", "PaymentID")),
    invoiceId: str(pick(o, "invoiceId", "InvoiceID") ?? pick(invoice, "invoiceId", "InvoiceID")),
    date: str(pick(o, "date", "Date")),
    amount: num(pick(o, "amount", "Amount")),
  };
}

function mapAgedReceivable(o: Record<string, unknown>): AgedReceivable {
  return {
    contactId: str(pick(o, "contactId", "ContactID")),
    current: num(pick(o, "current", "Current")),
    days1to30: num(pick(o, "days1to30", "Month1")),
    days31to60: num(pick(o, "days31to60", "Month2")),
    days61to90: num(pick(o, "days61to90", "Month3")),
    older: num(pick(o, "older", "Older")),
    total: num(pick(o, "total", "Total")),
  };
}
