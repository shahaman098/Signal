import { mkdtempSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { FakeXeroAdapter } from "./adapters/fake-xero.adapter.js";
import { FakeCompanyIntelAdapter, FakeNewsAdapter } from "./adapters/fake-intel.adapter.js";
import { ChaseEmailDrafter } from "./llm/chase-email.js";

function makeApp() {
  const xero = new FakeXeroAdapter();
  const contextDir = mkdtempSync(join(tmpdir(), "signal-ctx-"));
  const { app, services } = createApp({
    xero,
    intel: new FakeCompanyIntelAdapter(),
    news: new FakeNewsAdapter(),
    // No API key → chase emails + agent decisions use offline fallbacks.
    emailDrafter: new ChaseEmailDrafter("", "claude-opus-4-8"),
    contextDir,
    cacheTtlMs: 0,
  });
  return { app, xero, services, contextDir };
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
