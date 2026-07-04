import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { FakeXeroAdapter } from "./adapters/fake-xero.adapter.js";
import { ChaseEmailDrafter } from "./llm/chase-email.js";

function makeApp() {
  const xero = new FakeXeroAdapter();
  // No API key → chase-email drafter uses its offline template.
  const emailDrafter = new ChaseEmailDrafter("", "claude-opus-4-8");
  const app = createApp({ xero, emailDrafter, cacheTtlMs: 0 });
  return { app, xero };
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

  it("GET /api/analytics/contacts", async () => {
    const res = await request(app).get("/api/analytics/contacts");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
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
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // The lapsed customer should be among the proposals.
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
