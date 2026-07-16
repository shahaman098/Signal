import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

function mockCreativeBackend(overrides?: {
  radarMode?: "live" | "fallback";
  qwen?: boolean;
  metaSignals?: string[];
}) {
  process.env.CREATIVE_INTEL_API_BASE_URL = "https://creative.example";
  process.env.CREATIVE_INTEL_BRAND_ID = "brand-live-1";
  process.env.CREATIVE_INTEL_BRAND_NAME = "Live Brand";
  process.env.CREATIVE_INTEL_CATEGORY = "Energy Drinks";
  process.env.CREATIVE_INTEL_TIMEOUT_MS = "5000";
  if (overrides?.qwen ?? true) {
    process.env.DASHSCOPE_API_KEY = "test-dashscope-key";
    process.env.QWEN_BASE_URL = "https://qwen.example/compatible-mode/v1";
    process.env.QWEN_MODEL = "qwen-plus";
  } else {
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.QWEN_BASE_URL;
    delete process.env.QWEN_MODEL;
  }

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://creative.example/api/v1/brands/brand-live-1/web?include_competitors=true") {
      return new Response(
        JSON.stringify({
          nodes: [
            {
              id: "ad-1",
              brand_id: "brand-live-1",
              platform: "meta",
              title: "Creator proof video with screenshot evidence",
              health: "aging",
              health_score: 0.64,
              run_days: 22,
              reach_bucket: "high",
              variant_count: 2,
              creative_family_id: "creator-proof",
            },
          ],
          competitor_nodes: [
            {
              id: "comp-1",
              brand_id: "competitor-brand",
              platform: "meta",
              title: "Founder voiceover comparison teardown",
              health: "thriving",
              health_score: 0.82,
              run_days: 14,
              reach_bucket: "high",
              variant_count: 1,
              creative_family_id: "founder-proof",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url === "https://creative.example/api/v1/brands/brand-live-1/stats") {
      return new Response(
        JSON.stringify({
          total: 1,
          health_breakdown: {
            thriving: 0,
            aging: 1,
            fatiguing: 0,
            declining: 0,
          },
          fatiguing_count: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url === "https://qwen.example/compatible-mode/v1/chat/completions" && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      const system = String(body.messages?.[0]?.content ?? "");
      const content = system.includes("live creative-intelligence data collector")
        ? {
            brand: { name: "Live Brand", category: "Energy Drinks" },
            owned_ads: [
              {
                id: "qwen-ad-1",
                brand_id: "brand-live-1",
                platform: "meta",
                title: "Creator proof video with screenshot evidence",
                health: "aging",
                health_score: 0.64,
                run_days: 22,
                reach_bucket: "high",
                variant_count: 2,
                creative_family_id: "creator-proof",
              },
            ],
            competitor_ads: [
              {
                id: "qwen-comp-1",
                brand_id: "competitor-brand",
                platform: "meta",
                title: "Founder voiceover comparison teardown",
                health: "thriving",
                health_score: 0.82,
                run_days: 14,
                reach_bucket: "high",
                variant_count: 1,
                creative_family_id: "founder-proof",
              },
            ],
            meta_signals: overrides?.metaSignals ?? [
              "Qwen searched current public creative signals.",
              "Creator proof appears stronger than offer-led creative.",
            ],
          }
        : {
            text: "Shift away from the discount loop and scale creator proof.",
            thinking: ["Owned creatives are aging.", "Competitor proof looks stronger."],
            widget: "creative_brief",
            brief: {
              title: "Creator Proof Refresh Brief",
              narrative: "Move into faster evidence-led creative built around creator authority.",
              metrics: [
                { label: "Creative Opportunity Score", value: "81" },
                { label: "Fatigue Risk Score", value: "59" },
                { label: "Brand Fit Score", value: "76" },
              ],
              alerts: [
                { level: "Saturation", text: "Discount montage is aging." },
                { level: "Opportunity", text: "Creator proof remains healthier." },
              ],
              strategy: ["Retire the weakest offer-led variant.", "Launch creator-proof refreshes."],
            },
            suggestions: ["Show the weakest family", "Compare competitors", "Generate a refresh brief"],
          };
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(content),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url === "https://creative.example/api/v1/radar/chat" && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          ok: true,
          source: "meta_ad_library",
          mode: overrides?.radarMode ?? "live",
          result: {
            text: "Shift away from the discount loop and scale creator proof.",
            thinking: ["Owned creatives are aging.", "Competitor proof looks stronger."],
            widget: "creative_brief",
            brief: {
              title: "Creator Proof Refresh Brief",
              narrative: "Move into faster evidence-led creative built around creator authority.",
              metrics: [
                { label: "Creative Opportunity Score", value: "81" },
                { label: "Fatigue Risk Score", value: "59" },
                { label: "Brand Fit Score", value: "76" },
              ],
              alerts: [
                { level: "Saturation", text: "Discount montage is aging." },
                { level: "Opportunity", text: "Creator proof remains healthier." },
              ],
              strategy: ["Retire the weakest offer-led variant.", "Launch creator-proof refreshes."],
            },
            suggestions: ["Show the weakest family", "Compare competitors", "Generate a refresh brief"],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }));
}

describe("creative API", () => {
  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.QWEN_BASE_URL;
    delete process.env.QWEN_MODEL;
    delete process.env.WORKSPACE_ID;
    delete process.env.SIGNAL_TARGET_BRAND_NAME;
    delete process.env.SIGNAL_TARGET_CATEGORY;
    mockCreativeBackend();
  });

  it("GET /health", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/creative/overview", async () => {
    const app = createApp();
    const res = await request(app).get("/api/creative/overview");
    expect(res.status).toBe(200);
    expect(res.body.brand.name).toBe("Live Brand");
    expect(res.body.ads.length).toBe(1);
    expect(res.body.competitorAds.length).toBe(1);
  });

  it("POST /api/creative/radar", async () => {
    const app = createApp();
    const res = await request(app).post("/api/creative/radar").send({ prompt: "What should we test next?" });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("live");
    expect(res.body.result.brief.title).toBe("Creator Proof Refresh Brief");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://qwen.example/compatible-mode/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-dashscope-key",
        }),
      }),
    );
  });

  it("POST /api/creative/autopilot", async () => {
    const app = createApp();
    const res = await request(app).post("/api/creative/autopilot").send({});
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("live");
    expect(res.body.status).toBe("pending_human_review");
    expect(res.body.recommendation.type).toBe("refresh_family");
    expect(res.body.brief.brief.title).toBe("Creator Proof Refresh Brief");
    expect(res.body.humanCheckpoints.length).toBeGreaterThan(0);
  });

  it("runs from Qwen web-search data when no separate creative backend is configured", async () => {
    mockCreativeBackend({ metaSignals: ["Qwen searched current public creative signals."] });
    delete process.env.CREATIVE_INTEL_API_BASE_URL;
    delete process.env.CREATIVE_INTEL_BRAND_ID;
    process.env.SIGNAL_TARGET_BRAND_NAME = "Live Brand";
    process.env.SIGNAL_TARGET_CATEGORY = "Energy Drinks";

    const app = createApp();
    const res = await request(app).post("/api/creative/autopilot").send({});

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("live");
    expect(res.body.status).toBe("pending_human_review");
    expect(res.body.evidence.metaSignals[0]).toContain("Qwen searched");
  });

  it("rejects fallback radar output from the upstream backend", async () => {
    mockCreativeBackend({ radarMode: "fallback", qwen: false });
    const app = createApp();
    const res = await request(app).post("/api/creative/radar").send({ prompt: "What should we test next?" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("CreativeUpstreamError");
    expect(res.body.message).toContain("fallback output");
  });

  it("rejects localhost upstream configuration in production mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.CREATIVE_INTEL_API_BASE_URL = "http://127.0.0.1:8000";
    const app = createApp();
    const res = await request(app).get("/api/creative/overview");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("CreativeNotConfigured");
    expect(res.body.message).toContain("real remote backend");
  });
});
