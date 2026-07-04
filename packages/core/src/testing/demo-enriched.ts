import type { CompanyContext } from "../domain/company.js";
import type { Bill, Invoice, LineItem, Payment, Supplier, XeroSnapshot } from "../domain/types.js";
import { AS_OF, makeDemoSnapshot } from "./demo-data.js";

/**
 * Enriched fixture: extends the base four archetypes so that EVERY signal type
 * in the taxonomy has a concrete trigger. Used by the API's FakeXeroAdapter and
 * by the signals-engine tests.
 *
 * Additional archetypes:
 *   contact-slowpay   — always ~15d late but always settles → soft nudge only
 *   contact-distress  — Companies House distress flags + open balance → urgent collect
 *   contact-partial   — short-paid an invoice → chase the balance
 *   contact-goodnews  — funding news → timed upsell
 *   contact-shrinking — basket shrinking each cycle → early win-back
 *   contact-terms     — payment terms suddenly jumped 14d → 60d → flag
 *   contact-cohort    — order gap stretching + payments worsening → churn-cohort match
 *   contact-grim      — distressed SUPPLIER we depend on → dependency risk
 *
 * Plus, layered onto base contacts:
 *   Rita gains a near-duplicate invoice, an off-pattern draft (amount anomaly),
 *   rising unit costs on SVC-A (margin drift) and an SVC-A-only purchase history
 *   (cross-sell vs the SVC-A+SVC-B peer group).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgo(n: number): string {
  return new Date(new Date(`${AS_OF}T00:00:00.000Z`).getTime() - n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function line(description: string, amount: number, itemCode: string): LineItem {
  return { description, quantity: 1, unitAmount: amount, lineAmount: amount, accountCode: "200", itemCode };
}

export function makeEnrichedDemoSnapshot(): XeroSnapshot {
  const snap = makeDemoSnapshot();
  let seq = 0;
  const inv = (
    contactId: string,
    issuedDaysAgo: number,
    termDays: number,
    amount: number,
    status: Invoice["status"],
    items: LineItem[],
    paid = 0,
  ): Invoice => ({
    invoiceId: `einv-${++seq}`,
    invoiceNumber: `INV-${2000 + seq}`,
    contactId,
    status,
    issueDate: daysAgo(issuedDaysAgo),
    dueDate: daysAgo(issuedDaysAgo - termDays),
    total: amount,
    amountDue: status === "PAID" ? 0 : amount - paid,
    amountPaid: status === "PAID" ? amount : paid,
    lineItems: items,
  });
  const pay = (invoice: Invoice, daysLate: number, amount = invoice.total): Payment => ({
    paymentId: `epay-${invoice.invoiceId}`,
    invoiceId: invoice.invoiceId,
    date: new Date(new Date(invoice.dueDate).getTime() + daysLate * DAY_MS).toISOString().slice(0, 10),
    amount,
  });
  const paidInv = (contactId: string, issued: number, term: number, late: number, amount: number, item: string) => {
    const i = inv(contactId, issued, term, amount, "PAID", [line("Service", amount, item)]);
    snap.invoices.push(i);
    snap.payments.push(pay(i, late));
  };

  // ---- New contacts ----
  snap.contacts.push(
    { contactId: "contact-slowpay", name: "Steady Sam Supplies", email: "sam@steadysam.example" },
    { contactId: "contact-distress", name: "Dana Retail Ltd", email: "dana@danaretail.example" },
    { contactId: "contact-partial", name: "Partial Pat Ltd", email: "pat@partialpat.example" },
    { contactId: "contact-goodnews", name: "Grow Fast Ltd", email: "hello@growfast.example" },
    { contactId: "contact-shrinking", name: "Shrinkage Bros", email: "ops@shrinkage.example" },
    { contactId: "contact-terms", name: "Tina Terms Ltd", email: "tina@tinaterms.example" },
    { contactId: "contact-cohort", name: "Casey Trajectory Ltd", email: "casey@trajectory.example" },
    { contactId: "contact-grim", name: "Grim Materials Ltd", email: "sales@grimmaterials.example" },
  );

  // Steady Sam: 4 settled ~15d late (stable), one 15d-overdue balance → soft nudge.
  paidInv("contact-slowpay", 150, 20, 15, 900, "SVC-A");
  paidInv("contact-slowpay", 120, 20, 16, 900, "SVC-A");
  paidInv("contact-slowpay", 90, 20, 15, 900, "SVC-A");
  paidInv("contact-slowpay", 60, 20, 14, 900, "SVC-A");
  snap.invoices.push(inv("contact-slowpay", 35, 20, 600, "AUTHORISED", [line("Service", 600, "SVC-A")]));

  // Dana Retail: modest history, open balance only 5d overdue — but CH-flagged.
  paidInv("contact-distress", 90, 20, 3, 700, "SVC-D");
  paidInv("contact-distress", 60, 20, 4, 700, "SVC-D");
  snap.invoices.push(inv("contact-distress", 25, 20, 1200, "AUTHORISED", [line("Service", 1200, "SVC-D")]));

  // Partial Pat: short-paid 1200 of 2000; balance 25d overdue.
  paidInv("contact-partial", 120, 20, 5, 1500, "SVC-D");
  paidInv("contact-partial", 80, 20, 5, 1500, "SVC-D");
  const patInv = inv("contact-partial", 45, 20, 2000, "AUTHORISED", [line("Service", 2000, "SVC-D")], 1200);
  snap.invoices.push(patInv);
  snap.payments.push({ paymentId: "epay-partial", invoiceId: patInv.invoiceId, date: daysAgo(35), amount: 1200 });

  // Grow Fast: healthy repeat buyer of SVC-A + SVC-B; funding news lands 20d ago.
  for (const d of [75, 45, 15]) {
    const i = inv("contact-goodnews", d, 20, 1600, "PAID", [
      line("Service A", 1000, "SVC-A"),
      line("Service B", 600, "SVC-B"),
    ]);
    snap.invoices.push(i);
    snap.payments.push(pay(i, 0));
  }

  // Shrinkage Bros: SVC-A + SVC-B buyer whose basket shrinks 1200 → 450.
  for (const [d, amount] of [
    [110, 1200],
    [80, 1000],
    [50, 700],
    [20, 450],
  ] as const) {
    const i = inv("contact-shrinking", d, 20, amount, "PAID", [
      line("Service A", amount * 0.7, "SVC-A"),
      line("Service B", amount * 0.3, "SVC-B"),
    ]);
    snap.invoices.push(i);
    snap.payments.push(pay(i, 0));
  }

  // Tina Terms: three 14-day-term invoices, then a sudden 60-day-term one.
  paidInv("contact-terms", 100, 14, 0, 1100, "SVC-D");
  paidInv("contact-terms", 70, 14, 0, 1100, "SVC-D");
  paidInv("contact-terms", 40, 14, 0, 1100, "SVC-D");
  snap.invoices.push(inv("contact-terms", 10, 60, 1100, "AUTHORISED", [line("Service", 1100, "SVC-D")]));

  // Casey Trajectory: gap stretching (30→30→50, now 55d silent) + worsening payments.
  paidInv("contact-cohort", 165, 20, 2, 1300, "SVC-D");
  paidInv("contact-cohort", 135, 20, 5, 1300, "SVC-D");
  paidInv("contact-cohort", 105, 20, 9, 1300, "SVC-D");
  paidInv("contact-cohort", 55, 20, 14, 1300, "SVC-D");

  // ---- Rita extensions ----
  // Near-duplicate of her open invoice (same amount, 1 day apart).
  snap.invoices.push({
    invoiceId: "inv-rita-current-dup",
    invoiceNumber: "INV-2002",
    contactId: "contact-reliable",
    status: "AUTHORISED",
    issueDate: daysAgo(4),
    dueDate: daysAgo(-16),
    total: 1000,
    amountDue: 1000,
    amountPaid: 0,
    lineItems: [line("Monthly service", 1000, "SVC-A")],
  });
  // Off-pattern draft: 5.2× her typical amount — verify before sending.
  snap.invoices.push(inv("contact-reliable", 2, 20, 5200, "DRAFT", [line("Special project", 5200, "SVC-A")]));
  // Rising unit costs on her six settled SVC-A invoices → margin drift 45% → 15%.
  const ritaPaid = snap.invoices
    .filter((i) => i.contactId === "contact-reliable" && i.status === "PAID")
    .sort((a, b) => (a.issueDate < b.issueDate ? -1 : 1));
  const costs = [550, 600, 650, 700, 780, 850];
  ritaPaid.forEach((i, idx) => {
    if (idx < costs.length && i.lineItems[0]) i.lineItems[0].unitCost = costs[idx];
  });

  // ---- Money-out side: suppliers + bills ----
  const suppliers: Supplier[] = [
    { supplierId: "sup-landlord", name: "Cornerstone Property" },
    { supplierId: "sup-grim", name: "Grim Materials Ltd", contactId: "contact-grim" },
    { supplierId: "sup-soft", name: "Softools Inc" },
  ];
  const bills: Bill[] = [
    {
      billId: "bill-rent",
      supplierId: "sup-landlord",
      supplierName: "Cornerstone Property",
      issueDate: daysAgo(20),
      dueDate: daysAgo(-10),
      total: 2500,
      amountDue: 2500,
      status: "AUTHORISED",
    },
    {
      billId: "bill-materials",
      supplierId: "sup-grim",
      supplierName: "Grim Materials Ltd",
      issueDate: daysAgo(15),
      dueDate: daysAgo(-20),
      total: 5200,
      amountDue: 5200,
      status: "AUTHORISED",
    },
    {
      billId: "bill-software",
      supplierId: "sup-soft",
      supplierName: "Softools Inc",
      issueDate: daysAgo(5),
      dueDate: daysAgo(-25),
      total: 900,
      amountDue: 900,
      status: "AUTHORISED",
      earlyPaymentDiscount: { percent: 2, ifPaidBy: daysAgo(-7) },
    },
  ];
  snap.suppliers = suppliers;
  snap.bills = bills;

  return snap;
}

/**
 * Canned company-intelligence contexts — what the fake Companies House / news
 * adapters "discover" for the demo companies. The ingestion service persists
 * these as one JSON file per company.
 */
export function makeDemoCompanyContexts(): CompanyContext[] {
  const chBase = "https://find-and-update.company-information.service.gov.uk";
  return [
    {
      contactId: "contact-distress",
      companyName: "Dana Retail Ltd",
      role: "customer",
      companyNumber: "09876543",
      companiesHouse: {
        companyNumber: "09876543",
        companyName: "DANA RETAIL LTD",
        status: "active",
        incorporatedOn: "2015-03-11",
        flags: ["accounts-overdue", "gazette-strike-off-notice"],
        filings: [
          {
            date: daysAgo(18),
            type: "GAZ1",
            description: "First Gazette notice for compulsory strike-off",
            pdfUrl: `${chBase}/company/09876543/filing-history/GAZ1/document?format=pdf`,
          },
          {
            date: daysAgo(120),
            type: "AA",
            description: "Accounts overdue — last filed FY2024",
            pdfUrl: `${chBase}/company/09876543/filing-history/AA/document?format=pdf`,
          },
        ],
        profileUrl: `${chBase}/company/09876543`,
        lastChecked: AS_OF,
      },
      news: [
        {
          date: daysAgo(12),
          title: "Dana Retail faces winding-up petition from trade creditor",
          source: "Retail Gazette",
          url: "https://www.retailgazette.example/dana-retail-winding-up",
          sentiment: "negative",
          summary: "Supplier petitions court over unpaid balances; company disputes the amount.",
        },
      ],
      updatedAt: AS_OF,
    },
    {
      contactId: "contact-goodnews",
      companyName: "Grow Fast Ltd",
      role: "customer",
      companyNumber: "12345678",
      companiesHouse: {
        companyNumber: "12345678",
        companyName: "GROW FAST LTD",
        status: "active",
        incorporatedOn: "2021-06-01",
        flags: [],
        filings: [
          {
            date: daysAgo(200),
            type: "AA",
            description: "Full accounts filed on time",
            pdfUrl: `${chBase}/company/12345678/filing-history/AA/document?format=pdf`,
          },
        ],
        profileUrl: `${chBase}/company/12345678`,
        lastChecked: AS_OF,
      },
      news: [
        {
          date: daysAgo(20),
          title: "Grow Fast Ltd raises £2m seed round to expand operations",
          source: "TechRound",
          url: "https://www.techround.example/grow-fast-seed-round",
          sentiment: "positive",
          summary: "Funding earmarked for headcount and new regional sites.",
        },
      ],
      updatedAt: AS_OF,
    },
    {
      contactId: "contact-grim",
      companyName: "Grim Materials Ltd",
      role: "supplier",
      companyNumber: "05554443",
      companiesHouse: {
        companyNumber: "05554443",
        companyName: "GRIM MATERIALS LTD",
        status: "active",
        incorporatedOn: "2008-09-30",
        flags: ["accounts-overdue"],
        filings: [
          {
            date: daysAgo(45),
            type: "AA",
            description: "Accounts overdue — compliance notice issued",
            pdfUrl: `${chBase}/company/05554443/filing-history/AA/document?format=pdf`,
          },
        ],
        profileUrl: `${chBase}/company/05554443`,
        lastChecked: AS_OF,
      },
      news: [],
      updatedAt: AS_OF,
    },
    {
      contactId: "contact-reliable",
      companyName: "Reliable Rita Ltd",
      role: "customer",
      companyNumber: "07001001",
      companiesHouse: {
        companyNumber: "07001001",
        companyName: "RELIABLE RITA LTD",
        status: "active",
        incorporatedOn: "2012-01-20",
        flags: [],
        filings: [],
        profileUrl: `${chBase}/company/07001001`,
        lastChecked: AS_OF,
      },
      news: [],
      updatedAt: AS_OF,
    },
  ];
}
