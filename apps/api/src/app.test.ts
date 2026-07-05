import { mkdtempSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { FakeXeroAdapter } from "./adapters/fake-xero.adapter.js";
import {
  FakeCompanyIntelAdapter,
  FakeGazetteAdapter,
  FakeNewsAdapter,
} from "./adapters/fake-intel.adapter.js";
import { GeminiClient } from "./llm/gemini.js";

function makeApp() {
  const xero = new FakeXeroAdapter();
  const contextDir = mkdtempSync(join(tmpdir(), "signal-ctx-"));
  const proposalsDir = mkdtempSync(join(tmpdir(), "signal-props-"));
  const { app, services } = createApp({
    xero,
    intel: new FakeCompanyIntelAdapter(),
    news: new FakeNewsAdapter(),
    gazette: new FakeGazetteAdapter(),
    // No API key → chase emails + agent decisions use offline fallbacks.
    llm: new GeminiClient("", "gemini-3.5-flash"),
    contextDir,
    proposalsDir,
    cacheTtlMs: 0,
  });
  return { app, xero, services, contextDir, proposalsDir };
}

describe("API — reads & analysis", () => {
  let app: ReturnType<typeof makeApp>["app"];
  beforeEach(() => {
    app = makeApp().app;
  });

  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/analytics/report returns every derivation", async () => {
    const res = await request(app).get("/api/analytics/report");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("paymentPatterns");
    expect(res.body).toHaveProperty("orderCadence");
    expect(res.body).toHaveProperty("slipRisk");
    expect(res.body).toHaveProperty("recoverable");
    expect(res.body).toHaveProperty("churn");
  });

  it("GET /api/analytics/slip-risk ranks the chronic payer highest", async () => {
    const res = await request(app).get("/api/analytics/slip-risk");
    expect(res.status).toBe(200);
    expect(res.body[0].contactId).toBe("contact-chronic");
    expect(res.body[0].band).toBe("high");
  });

  it("GET /api/analytics/contacts includes the enriched archetypes", async () => {
    const res = await request(app).get("/api/analytics/contacts");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(12);
    const ids = res.body.map((c: { contactId: string }) => c.contactId);
    expect(ids).toContain("contact-distress");
    expect(ids).toContain("contact-grim");
  });
});

describe("API — signals & company intelligence", () => {
  it("GET /api/signals covers all five categories and prioritises distress", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/signals");
    expect(res.status).toBe(200);
    const { signals, countsByCategory } = res.body;
    expect(countsByCategory["cash-recovery"]).toBeGreaterThan(0);
    expect(countsByCategory["revenue-growth"]).toBeGreaterThan(0);
    expect(countsByCategory["cashflow-timing"]).toBeGreaterThan(0);
    expect(countsByCategory.strategic).toBeGreaterThan(0);
    expect(countsByCategory.anomaly).toBeGreaterThan(0);
    // The CH-distressed customer's collection tops the list.
    expect(signals[0].type).toBe("distress-collection");
    expect(signals[0].contactId).toBe("contact-distress");
  });

  it("filters by ?category=", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/signals?category=anomaly");
    expect(res.status).toBe(200);
    expect(res.body.signals.length).toBeGreaterThan(0);
    for (const s of res.body.signals) expect(s.category).toBe("anomaly");
  });

  it("ingestion writes one context JSON file per company", async () => {
    const { app, contextDir } = makeApp();
    const res = await request(app).post("/api/context/refresh");
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(12);
    const files = (await readdir(contextDir)).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(12);
    // Spot-check the distressed customer's file: CH flags + filing PDF + news link.
    const dana = JSON.parse(await readFile(join(contextDir, "contact-distress.json"), "utf8"));
    expect(dana.companiesHouse.flags).toContain("gazette-strike-off-notice");
    expect(dana.companiesHouse.filings[0].pdfUrl).toMatch(/company-information\.service\.gov\.uk/);
    expect(dana.news[0].url).toMatch(/^https:\/\//);
    expect(dana.news[0].sentiment).toBe("negative");
  });

  it("GET /api/context/:contactId serves the full company document", async () => {
    const { app } = makeApp();
    await request(app).post("/api/context/refresh");
    const res = await request(app).get("/api/context/contact-goodnews");
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe("Grow Fast Ltd");
    expect(res.body.news[0].title).toMatch(/£2m seed round/);
  });

  it("GET /api/context/:contactId 404s for unknown companies", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/context/nope");
    expect(res.status).toBe(404);
  });
});

describe("API — sources & company briefs", () => {
  it("GET /api/sources returns the unified evidence feed, newest first", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/sources");
    expect(res.status).toBe(200);
    const items = res.body as { type: string; date: string; companyName: string; url?: string }[];
    expect(items.length).toBeGreaterThan(3);
    // Contains all three evidence types from the fake intel
    const types = new Set(items.map((i) => i.type));
    expect(types.has("news")).toBe(true);
    expect(types.has("gazette")).toBe(true);
    expect(types.has("filing")).toBe(true);
    // Sorted newest-first
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.date >= items[i]!.date).toBe(true);
    }
  });

  it("GET /api/companies/:id/brief composes the dossier from real data", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/companies/contact-distress/brief");
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.briefBy).toBe("rules"); // offline
    expect(b.brief).toMatch(/Dana Retail/);
    expect(b.brief).toMatch(/accounts-overdue/); // flags surfaced
    expect(b.brief).toMatch(/Gazette notice/);
    expect(b.metrics.length).toBeGreaterThan(0);
    expect(b.signals.some((s: { type: string }) => s.type === "distress-collection")).toBe(true);
    expect(b.evidence.some((e: { type: string }) => e.type === "gazette")).toBe(true);
  });

  it("brief 404s for unknown companies", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/companies/nope/brief");
    expect(res.status).toBe(404);
  });
});

describe("API — measure & interrogate", () => {
  it("GET /api/impact starts at zero and counts executed actions", async () => {
    const { app } = makeApp();
    const before = await request(app).get("/api/impact");
    expect(before.status).toBe(200);
    expect(before.body.totalUnlocked).toBe(0);

    // Generate (auto-executes chase drafts) then approve a quote proposal.
    await request(app).post("/api/proposals/generate");
    const proposals = (await request(app).get("/api/proposals")).body as {
      id: string;
      status: string;
      prepared?: { lineItems: { lineAmount: number }[] };
    }[];
    const quote = proposals.find((p) => p.status === "proposed" && p.prepared)!;
    await request(app).post(`/api/proposals/${encodeURIComponent(quote.id)}/approve`);

    const after = await request(app).get("/api/impact");
    expect(after.body.actionsExecuted).toBeGreaterThan(0);
    expect(after.body.emailsDrafted).toBeGreaterThan(0);
    expect(after.body.quotesCreated).toBe(1);
    const quoteValue = quote.prepared!.lineItems.reduce((s, li) => s + li.lineAmount, 0);
    expect(after.body.pipelineCreated).toBe(quoteValue);
    expect(after.body.totalUnlocked).toBeGreaterThanOrEqual(quoteValue);
  });

  it("counts REAL cash recovery when a chased invoice's balance drops in Xero", async () => {
    const { app, xero } = makeApp();
    await request(app).post("/api/proposals/generate");

    // Find an auto-executed chase and pay its invoice down in the (fake) ledger.
    const proposals = (await request(app).get("/api/proposals")).body as {
      status: string;
      invoiceId?: string;
      action: { kind: string };
      result?: { amountDueAtExecution?: number };
    }[];
    const chase = proposals.find((p) => p.action.kind === "chase-email" && p.status === "executed")!;
    expect(chase.result?.amountDueAtExecution).toBeGreaterThan(0);

    const snapshot = await xero.snapshot();
    const invoice = snapshot.invoices.find((i) => i.invoiceId === chase.invoiceId)!;
    const paid = invoice.amountDue;
    invoice.amountPaid += paid;
    invoice.amountDue = 0; // customer paid after the chase

    const impact = await request(app).get("/api/impact");
    expect(impact.body.cashRecovered).toBe(paid);
  });

  it("POST /api/ask answers grounded questions offline with real numbers", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/ask").send({ question: "How much is overdue right now?" });
    expect(res.status).toBe(200);
    expect(res.body.answeredBy).toBe("offline");
    expect(res.body.answer).toMatch(/overdue/i);
    expect(res.body.answer).toMatch(/\d/); // contains actual figures
  });

  it("POST /api/ask validates input", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/ask").send({});
    expect(res.status).toBe(400);
  });
});

describe("API — agent decisions", () => {
  it("POST /api/agent/decide returns prioritised decisions with reasoning", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/agent/decide");
    expect(res.status).toBe(200);
    const { decisions, decidedBy } = res.body;
    expect(decidedBy).toBe("rules"); // offline fallback
    expect(decisions.length).toBeGreaterThan(10);
    // Distress collection is decided first and acted on now.
    expect(decisions[0].signalId).toMatch(/^distress-collection/);
    expect(decisions[0].decision).toBe("act-now");
    expect(decisions[0].reasoning).toMatch(/gazette-strike-off-notice/);
    // Every decision carries a concrete action and reasoning.
    for (const d of decisions) {
      expect(d.action.kind).toBeTruthy();
      expect(d.reasoning.length).toBeGreaterThan(10);
    }
  });
});

describe("API — writes & actions", () => {
  it("POST /api/actions/quotes creates a quote and records it", async () => {
    const { app, xero } = makeApp();
    const res = await request(app)
      .post("/api/actions/quotes")
      .send({
        contactId: "contact-lapsed",
        reference: "Reactivation",
        lineItems: [{ description: "Welcome back", quantity: 1, unitAmount: 500, lineAmount: 500 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.quoteId).toBeTruthy();
    expect(res.body.deepLink).toMatch(/^https:\/\/go\.xero\.com\//);
    expect(xero.created.quotes).toHaveLength(1);
  });

  it("POST /api/actions/quotes rejects invalid payloads", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/actions/quotes").send({ contactId: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("POST /api/actions/invoices/draft creates a draft", async () => {
    const { app, xero } = makeApp();
    const res = await request(app)
      .post("/api/actions/invoices/draft")
      .send({
        contactId: "contact-new",
        lineItems: [{ description: "Service", quantity: 1, unitAmount: 100, lineAmount: 100 }],
      });
    expect(res.status).toBe(201);
    expect(xero.created.invoiceDrafts).toHaveLength(1);
  });

  it("POST /api/actions/payments records a payment", async () => {
    const { app, xero } = makeApp();
    const res = await request(app)
      .post("/api/actions/payments")
      .send({ invoiceId: "inv-1", accountId: "acc-1", date: "2026-07-04", amount: 250 });
    expect(res.status).toBe(201);
    expect(xero.created.payments).toHaveLength(1);
  });

  it("GET /api/actions/reactivation-proposals targets churn-risk customers", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/actions/reactivation-proposals");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.map((p: { contactId: string }) => p.contactId)).toContain("contact-lapsed");
    expect(res.body[0].quote.lineItems.length).toBeGreaterThan(0);
  });

  it("POST /api/actions/invoices/:id/chase-email drafts an email (template fallback)", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/actions/invoices/inv-12/chase-email").send({ tone: "firm" });
    expect(res.status).toBe(200);
    expect(res.body.generatedBy).toBe("template");
    expect(res.body.subject).toMatch(/invoice/i);
    expect(res.body.body).toContain("Chronic Chris Co");
  });

  it("chase-email 404s for an unknown invoice", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/actions/invoices/does-not-exist/chase-email").send({});
    expect(res.status).toBe(404);
  });
});
