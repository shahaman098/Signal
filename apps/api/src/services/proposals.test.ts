import { mkdtempSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { FakeXeroAdapter } from "../adapters/fake-xero.adapter.js";
import {
  FakeCompanyIntelAdapter,
  FakeGazetteAdapter,
  FakeNewsAdapter,
} from "../adapters/fake-intel.adapter.js";
import { GeminiClient } from "../llm/gemini.js";
import { ProposalStore } from "./proposal-store.js";
import type { ActionProposal } from "./proposal.service.js";

function makeApp(overrides?: { xero?: FakeXeroAdapter }) {
  const xero = overrides?.xero ?? new FakeXeroAdapter();
  const contextDir = mkdtempSync(join(tmpdir(), "signal-ctx-"));
  const proposalsDir = mkdtempSync(join(tmpdir(), "signal-props-"));
  const deps = {
    xero,
    intel: new FakeCompanyIntelAdapter(),
    news: new FakeNewsAdapter(),
    gazette: new FakeGazetteAdapter(),
    llm: new GeminiClient("", "gemini-3.5-flash"),
    contextDir,
    proposalsDir,
    cacheTtlMs: 60_000,
  };
  const { app } = createApp(deps);
  return { app, xero, contextDir, proposalsDir, deps };
}

async function generate(app: ReturnType<typeof makeApp>["app"]) {
  const res = await request(app).post("/api/proposals/generate");
  expect(res.status).toBe(200);
  return res.body as { created: number; updated: number; unchanged: number; superseded: number; autoExecuted: number };
}

async function list(app: ReturnType<typeof makeApp>["app"]): Promise<ActionProposal[]> {
  const res = await request(app).get("/api/proposals");
  expect(res.status).toBe(200);
  return res.body;
}

describe("Plan stage — generation", () => {
  it("creates proposals for actionable decisions with full reasoning chains", async () => {
    const { app } = makeApp();
    const result = await generate(app);
    expect(result.created).toBeGreaterThan(5);

    const proposals = await list(app);
    const distress = proposals.find((p) => p.signalId.startsWith("distress-collection"))!;
    expect(distress).toBeTruthy();
    expect(distress.reasoning.signalReasoning.length).toBeGreaterThan(1);
    expect(distress.reasoning.decisionReasoning.length).toBeGreaterThan(10);
    // Evidence chain includes Companies House links from the context document.
    expect(distress.reasoning.evidence.some((e) => e.url?.includes("company-information.service.gov.uk"))).toBe(true);
    // Gazette notice (official public record) present for the distressed company.
    expect(distress.reasoning.evidence.some((e) => e.label.startsWith("Gazette:"))).toBe(true);
    // Input data for charts: series + metrics for the contact.
    expect(distress.inputs.series.length).toBeGreaterThan(0);
    expect(distress.inputs.metrics.length).toBeGreaterThan(0);
  });

  it("auto-executes chase-email drafts (policy: drafts only), quotes wait", async () => {
    const { app } = makeApp();
    const result = await generate(app);
    expect(result.autoExecuted).toBeGreaterThan(0);

    const proposals = await list(app);
    const chases = proposals.filter((p) => p.action.kind === "chase-email");
    for (const c of chases) {
      expect(c.status).toBe("executed");
      expect(c.autoExecuted).toBe(true);
      expect(c.result?.emailDraft?.subject).toBeTruthy();
    }
    const quotes = proposals.filter((p) => p.action.kind === "create-quote" || p.action.kind === "convert-recurring");
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      expect(q.status).toBe("proposed");
      expect(q.prepared?.lineItems.length).toBeGreaterThan(0); // payload baked for review
    }
  });

  it("is idempotent: regenerating produces no duplicates", async () => {
    const { app } = makeApp();
    const first = await generate(app);
    const second = await generate(app);
    expect(second.created).toBe(0);
    expect(second.unchanged).toBeGreaterThan(0);
    const proposals = await list(app);
    expect(proposals.length).toBe(first.created);
  });

  it("supersedes pending proposals whose signal disappeared", async () => {
    const { app, proposalsDir } = makeApp();
    const store = new ProposalStore(proposalsDir);
    await store.save({
      id: "overdue-chase:ghost-invoice",
      signalId: "overdue-chase:ghost-invoice",
      status: "proposed",
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
      snapshotAsOf: "2026-07-01",
      signalFingerprint: "xyz",
      title: "Ghost proposal",
      category: "cash-recovery",
      severity: "medium",
      action: { kind: "chase-email", invoiceId: "ghost-invoice", tone: "friendly" },
      reasoning: { decision: "act-now", decisionReasoning: "x", decidedBy: "rules", priority: 99, signalReasoning: [], evidence: [] },
      inputs: { series: [], metrics: [] },
    });

    const result = await generate(app);
    expect(result.superseded).toBe(1);
    const ghost = (await list(app)).find((p) => p.id === "overdue-chase:ghost-invoice")!;
    expect(ghost.status).toBe("superseded");
    expect(ghost.resolution?.note).toMatch(/no longer present/);
  });
});

describe("Plan stage — approval lifecycle", () => {
  it("approving a quote proposal executes the real write and records the deep link", async () => {
    const { app, xero } = makeApp();
    await generate(app);
    const quote = (await list(app)).find((p) => p.status === "proposed" && p.prepared)!;

    const res = await request(app).post(`/api/proposals/${quote.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("executed");
    expect(res.body.result.xeroId).toBeTruthy();
    expect(res.body.result.deepLink).toMatch(/^https:\/\/go\.xero\.com\//);
    expect(xero.created.quotes.length).toBe(1);
    // The executed payload is exactly what the human reviewed.
    expect(xero.created.quotes[0]).toEqual(quote.prepared);
  });

  it("re-approving is a 409 InvalidState", async () => {
    const { app } = makeApp();
    await generate(app);
    const quote = (await list(app)).find((p) => p.status === "proposed" && p.prepared)!;
    await request(app).post(`/api/proposals/${quote.id}/approve`);
    const again = await request(app).post(`/api/proposals/${quote.id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("InvalidState");
  });

  it("approving an acknowledge-only proposal records the note without a Xero write", async () => {
    const { app, xero } = makeApp();
    await generate(app);
    const ack = (await list(app)).find(
      (p) => p.status === "proposed" && ["suggest-upfront-terms", "flag-review", "defer-bill", "pay-bill-early"].includes(p.action.kind),
    )!;
    const res = await request(app).post(`/api/proposals/${ack.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("executed");
    expect(res.body.result.note).toMatch(/Acknowledged/);
    expect(xero.created.quotes).toHaveLength(0);
    expect(xero.created.invoiceDrafts).toHaveLength(0);
  });

  it("rejecting records the note; rejecting again is 409", async () => {
    const { app } = makeApp();
    await generate(app);
    const target = (await list(app)).find((p) => p.status === "proposed")!;
    const res = await request(app).post(`/api/proposals/${target.id}/reject`).send({ note: "not now" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.resolution.note).toBe("not now");
    const again = await request(app).post(`/api/proposals/${target.id}/reject`).send({});
    expect(again.status).toBe(409);
  });

  it("captures execution failure as data (status failed, message persisted)", async () => {
    const xero = new FakeXeroAdapter();
    xero.createQuote = async () => {
      throw new Error("Xero exploded");
    };
    const { app } = makeApp({ xero });
    await generate(app);
    const quote = (await list(app)).find((p) => p.status === "proposed" && p.prepared)!;
    const res = await request(app).post(`/api/proposals/${quote.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("failed");
    expect(res.body.failure.message).toBe("Xero exploded");
  });

  it("attaches AI verification to pending proposals when the LLM is enabled", async () => {
    // Stub Gemini: confirms every proposal except amount-anomaly ones, which
    // it flags for review — exercising the full verification round-trip.
    class StubGemini extends GeminiClient {
      constructor() {
        super("", "stub");
      }
      override get enabled() {
        return true;
      }
      override async complete(opts: { prompt: string; jsonSchema?: Record<string, unknown> }) {
        const payload = JSON.parse(opts.prompt) as { proposals?: { id: string }[] };
        if (!payload.proposals) return null; // not the verification call
        return JSON.stringify({
          verifications: payload.proposals.map((p) => ({
            id: p.id,
            verdict: p.id.startsWith("amount-anomaly") ? "needs-review" : "confirmed",
            note: p.id.startsWith("amount-anomaly")
              ? "Raw series does not support a 5x jump"
              : "Metrics match the raw series",
          })),
        });
      }
    }

    const xero = new FakeXeroAdapter();
    const contextDir = mkdtempSync(join(tmpdir(), "signal-ctx-"));
    const proposalsDir = mkdtempSync(join(tmpdir(), "signal-props-"));
    const { app } = createApp({
      xero,
      intel: new FakeCompanyIntelAdapter(),
      news: new FakeNewsAdapter(),
      gazette: new FakeGazetteAdapter(),
      llm: new StubGemini(),
      contextDir,
      proposalsDir,
      cacheTtlMs: 60_000,
    });

    await generate(app);
    const proposals = await list(app);
    const pending = proposals.filter((p) => p.status === "proposed");
    expect(pending.length).toBeGreaterThan(0);
    for (const p of pending) {
      expect(p.verification?.verifiedBy).toBe("gemini");
    }
    const anomaly = pending.find((p) => p.id.startsWith("amount-anomaly"))!;
    expect(anomaly.verification?.verdict).toBe("needs-review");
    expect(pending.some((p) => p.verification?.verdict === "confirmed")).toBe(true);
  });

  it("persists across app restarts (same dirs, new createApp)", async () => {
    const { app, proposalsDir, contextDir, deps } = makeApp();
    await generate(app);
    const before = await list(app);
    expect(before.length).toBeGreaterThan(0);

    const second = createApp({ ...deps, contextDir, proposalsDir });
    const after = await list(second.app);
    expect(after.length).toBe(before.length);
    const files = (await readdir(proposalsDir)).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(before.length);
  });
});
