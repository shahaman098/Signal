import { describe, expect, it } from "vitest";
import {
  computeAgedFromInvoices,
  contactIdFrom,
  parseContact,
  parseInvoice,
  parseKV,
  parseLineItems,
  parsePayment,
} from "./xero-mcp.adapter.js";

/**
 * Fixtures below replicate the EXACT output shapes of @xeroapi/xero-mcp-server
 * (read from its dist/tools/list/*.tool.js formatters).
 */

const CONTACT_BLOCK = [
  "Contact: Acme Trading Ltd",
  "ID: 3f1c-acme-guid",
  "Email: accounts@acme.example",
  "Type: Customer, Supplier",
  "Default Currency: GBP",
  "Status: ACTIVE",
].join("\n");

const CONTACT_NO_EMAIL = ["Contact: Quiet Co", "ID: quiet-guid", "No email", "Type: Customer", "Status: ACTIVE"].join(
  "\n",
);

const INVOICE_BLOCK = [
  "Invoice ID: inv-guid-1",
  "Invoice: INV-0042",
  "Type: ACCREC",
  "Status: AUTHORISED",
  "Contact: Acme Trading Ltd (3f1c-acme-guid)",
  "Date: 2026-06-01",
  "Due Date: 2026-06-21",
  "Sub Total: 1000",
  "Total Tax: 200",
  "Total: 1200",
  "Currency: GBP",
  "Amount Due: 700",
  "Amount Paid: 500",
].join("\n");

// Formatter omits falsy fields: a fully-paid invoice has no Amount Due line.
const PAID_INVOICE_BLOCK = [
  "Invoice ID: inv-guid-2",
  "Invoice: INV-0040",
  "Type: ACCREC",
  "Status: PAID",
  "Contact: Acme Trading Ltd (3f1c-acme-guid)",
  "Date: 2026-05-01",
  "Due Date: 2026-05-21",
  "Total: 800",
  "Amount Paid: 800",
].join("\n");

const PAYMENT_BLOCK = [
  "Payment ID: pay-guid-9",
  "Date: 2026-06-25",
  "Amount: 500",
  "Status: AUTHORISED",
  "Payment Type: ACCRECPAYMENT",
  "Account: Business Account (acc-guid)",
  "Invoice:",
  "  Invoice Number: INV-0042",
  "  Invoice ID: inv-guid-1",
  "  Contact: Acme Trading Ltd (3f1c-acme-guid)",
  "  Type: ACCREC",
  "  Total: 1200",
  "  Amount Due: 700",
].join("\n");

// Line items: `Line Items: ${items.map(formatLineItem)}` — array joins with ","
const INVOICE_WITH_LINES =
  INVOICE_BLOCK +
  "\n" +
  "Line Items: " +
  [
    ["Item ID: undefined", "Item Code: SVC-A", "Description: Monthly service", "Quantity: 2", "Unit Amount: 500", "Account Code: 200", "Tax Type: OUTPUT2", "Tracking: undefined", "Line Amount: 1000"].join("\n"),
    ["Item ID: undefined", "Item Code: undefined", "Description: Delivery", "Quantity: 1", "Unit Amount: 200", "Account Code: 200", "Tax Type: OUTPUT2", "Tracking: undefined", "Line Amount: 200"].join("\n"),
  ].join(",");

describe("Xero MCP text parsers", () => {
  it("parses contacts, treating 'No email' as absent", () => {
    const c = parseContact(parseKV(CONTACT_BLOCK))!;
    expect(c).toEqual({ contactId: "3f1c-acme-guid", name: "Acme Trading Ltd", email: "accounts@acme.example" });
    const q = parseContact(parseKV(CONTACT_NO_EMAIL))!;
    expect(q.email).toBeUndefined();
  });

  it("extracts the contact id from the parenthesised contact line", () => {
    expect(contactIdFrom("Acme Trading (UK) Ltd (3f1c-acme-guid)")).toBe("3f1c-acme-guid");
  });

  it("parses an open invoice with amounts", () => {
    const inv = parseInvoice(parseKV(INVOICE_BLOCK))!;
    expect(inv.invoiceId).toBe("inv-guid-1");
    expect(inv.invoiceNumber).toBe("INV-0042");
    expect(inv.contactId).toBe("3f1c-acme-guid");
    expect(inv.status).toBe("AUTHORISED");
    expect(inv.issueDate).toBe("2026-06-01");
    expect(inv.dueDate).toBe("2026-06-21");
    expect(inv.total).toBe(1200);
    expect(inv.amountDue).toBe(700);
    expect(inv.amountPaid).toBe(500);
  });

  it("defaults omitted falsy amounts to 0 (paid invoice has no Amount Due line)", () => {
    const inv = parseInvoice(parseKV(PAID_INVOICE_BLOCK))!;
    expect(inv.amountDue).toBe(0);
    expect(inv.amountPaid).toBe(800);
  });

  it("parses payments including the nested invoice link", () => {
    const p = parsePayment(parseKV(PAYMENT_BLOCK))!;
    expect(p).toEqual({ paymentId: "pay-guid-9", invoiceId: "inv-guid-1", date: "2026-06-25", amount: 500 });
  });

  it("parses comma-joined multi-line line items, dropping 'undefined' codes", () => {
    const lines = parseLineItems(INVOICE_WITH_LINES);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ description: "Monthly service", quantity: 2, unitAmount: 500, lineAmount: 1000, itemCode: "SVC-A" });
    expect(lines[1]!.itemCode).toBeUndefined();
  });

  it("computes aged buckets from open invoices", () => {
    const open = parseInvoice(parseKV(INVOICE_BLOCK))!; // due 2026-06-21, 700 due
    const paid = parseInvoice(parseKV(PAID_INVOICE_BLOCK))!;
    const aged = computeAgedFromInvoices([open, paid], "2026-07-04");
    expect(aged).toHaveLength(1);
    expect(aged[0]).toMatchObject({ contactId: "3f1c-acme-guid", days1to30: 700, total: 700, current: 0 });
  });
});
