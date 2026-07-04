import type {
  AgedReceivable,
  Contact,
  Invoice,
  LineItem,
  Payment,
  XeroSnapshot,
} from "../domain/types.js";

/**
 * A deterministic, hand-built Xero snapshot used by unit tests and by the API's
 * FakeXeroAdapter. Dates are all derived from a fixed AS_OF so results never
 * depend on the wall clock. Four archetypes are represented:
 *
 *   contact-reliable  — pays on time, orders monthly, current → healthy
 *   contact-chronic   — pays weeks late & worsening, carries overdue balances
 *   contact-lapsed    — was regular, nothing for ~7 months → churn risk
 *   contact-new       — one recent order
 */
export const AS_OF = "2026-07-04";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO date string `n` days before AS_OF. */
function daysAgo(n: number): string {
  const base = new Date(`${AS_OF}T00:00:00.000Z`);
  return new Date(base.getTime() - n * DAY_MS).toISOString().slice(0, 10);
}

function line(description: string, amount: number): LineItem {
  return { description, quantity: 1, unitAmount: amount, lineAmount: amount, accountCode: "200" };
}

const contacts: Contact[] = [
  { contactId: "contact-reliable", name: "Reliable Rita Ltd", email: "ap@reliablerita.example" },
  { contactId: "contact-chronic", name: "Chronic Chris Co", email: "accounts@chronicchris.example" },
  { contactId: "contact-lapsed", name: "Lapsed Lucy Trading", email: "lucy@lapsedlucy.example" },
  { contactId: "contact-new", name: "New Nick GmbH", email: "nick@newnick.example" },
];

const invoices: Invoice[] = [];
const payments: Payment[] = [];
let seq = 0;

function paidInvoice(
  contactId: string,
  issuedDaysAgo: number,
  termDays: number,
  daysLate: number,
  amount: number,
): void {
  seq += 1;
  const id = `inv-${seq}`;
  const issueDate = daysAgo(issuedDaysAgo);
  const dueDate = daysAgo(issuedDaysAgo - termDays);
  const paidDate = daysAgo(issuedDaysAgo - termDays - daysLate);
  invoices.push({
    invoiceId: id,
    invoiceNumber: `INV-${1000 + seq}`,
    contactId,
    status: "PAID",
    issueDate,
    dueDate,
    total: amount,
    amountDue: 0,
    amountPaid: amount,
    lineItems: [line("Monthly service", amount)],
  });
  payments.push({ paymentId: `pay-${seq}`, invoiceId: id, date: paidDate, amount });
}

function overdueInvoice(
  contactId: string,
  issuedDaysAgo: number,
  termDays: number,
  amount: number,
): void {
  seq += 1;
  const id = `inv-${seq}`;
  invoices.push({
    invoiceId: id,
    invoiceNumber: `INV-${1000 + seq}`,
    contactId,
    status: "AUTHORISED",
    issueDate: daysAgo(issuedDaysAgo),
    dueDate: daysAgo(issuedDaysAgo - termDays),
    total: amount,
    amountDue: amount,
    amountPaid: 0,
    lineItems: [line("Monthly service", amount)],
  });
}

// Reliable Rita: monthly orders, always paid ~2 days early, one open-but-not-due.
for (let m = 6; m >= 1; m--) paidInvoice("contact-reliable", m * 30, 20, -2, 1000);
invoices.push({
  invoiceId: "inv-rita-current",
  invoiceNumber: "INV-2001",
  contactId: "contact-reliable",
  status: "AUTHORISED",
  issueDate: daysAgo(5),
  dueDate: daysAgo(-15), // due in 15 days → not overdue
  total: 1000,
  amountDue: 1000,
  amountPaid: 0,
  lineItems: [line("Monthly service", 1000)],
});

// Chronic Chris: pays late and getting worse (10d → 35d), plus two overdue balances.
paidInvoice("contact-chronic", 180, 20, 10, 2000);
paidInvoice("contact-chronic", 150, 20, 14, 2000);
paidInvoice("contact-chronic", 120, 20, 22, 2000);
paidInvoice("contact-chronic", 90, 20, 33, 2000);
paidInvoice("contact-chronic", 60, 20, 38, 2000);
overdueInvoice("contact-chronic", 70, 20, 3500); // ~50 days overdue
overdueInvoice("contact-chronic", 40, 20, 1500); // ~20 days overdue

// Lapsed Lucy: regular last year, nothing for ~210 days; all historical paid on time.
for (let m = 12; m >= 8; m--) paidInvoice("contact-lapsed", m * 30, 30, 1, 800);

// New Nick: single recent order, paid promptly.
paidInvoice("contact-new", 12, 20, 0, 500);

const agedReceivables: AgedReceivable[] = [
  { contactId: "contact-reliable", current: 1000, days1to30: 0, days31to60: 0, days61to90: 0, older: 0, total: 1000 },
  { contactId: "contact-chronic", current: 0, days1to30: 1500, days31to60: 3500, days61to90: 0, older: 0, total: 5000 },
  { contactId: "contact-lapsed", current: 0, days1to30: 0, days31to60: 0, days61to90: 0, older: 0, total: 0 },
  { contactId: "contact-new", current: 0, days1to30: 0, days31to60: 0, days61to90: 0, older: 0, total: 0 },
];

export function makeDemoSnapshot(): XeroSnapshot {
  // Return deep copies so tests can mutate freely without cross-contamination.
  return structuredClone({
    asOf: AS_OF,
    contacts,
    invoices,
    payments,
    agedReceivables,
  });
}
