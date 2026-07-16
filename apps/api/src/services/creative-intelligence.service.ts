import { z } from "zod";

export type CreativeHealth = "thriving" | "aging" | "fatiguing" | "declining";
export type CreativePlatform = "meta" | "tiktok";

export interface CreativeAdNode {
  id: string;
  brand: string;
  scope: "owned" | "competitor";
  title: string;
  platform: CreativePlatform;
  health: CreativeHealth;
  healthScore: number;
  runDays: number;
  reachBucket: "high" | "mid" | "low";
  variantCount: number;
  creativeFamilyId: string;
  familyLabel: string;
  hook: string;
  format: string;
  cta: string;
  proofStyle: string;
}

export interface CreativePattern {
  label: string;
  count: number;
  avgHealth: number;
  status: "saturated" | "rising" | "open";
  note: string;
}

export interface CreativeFamily {
  id: string;
  label: string;
  ads: CreativeAdNode[];
  avgHealth: number;
}

export interface CreativeOverview {
  brand: { name: string; category: string };
  stats: {
    total: number;
    fatiguingCount: number;
    familyCount: number;
    avgHealth: number;
  };
  ads: CreativeAdNode[];
  competitorAds: CreativeAdNode[];
  families: CreativeFamily[];
  patterns: CreativePattern[];
  metaSignals: string[];
}

export type CreativeWidget =
  | "genome_map"
  | "saturation_chart"
  | "opportunity_scorecard"
  | "competitor_matrix"
  | "creative_brief"
  | "luma_concepts";

export interface CreativeRadarResult {
  text: string;
  thinking: string[];
  widget: CreativeWidget;
  brief: {
    title: string;
    narrative: string;
    metrics: { label: string; value: string }[];
    alerts: { level: string; text: string }[];
    strategy: string[];
  };
  suggestions: string[];
}

export interface CreativeRadarEnvelope {
  mode: "live";
  result: CreativeRadarResult;
}

export type CreativeAgentActionType =
  | "refresh_family"
  | "scale_winner"
  | "counter_competitor"
  | "test_white_space";

export interface CreativeAutopilotRun {
  mode: "live";
  status: "pending_human_review";
  goal: string;
  prompt: string;
  recommendation: {
    type: CreativeAgentActionType;
    title: string;
    rationale: string;
    firstMove: string;
    expectedImpact: string;
  };
  evidence: {
    weakestFamily: null | { id: string; label: string; avgHealth: number; adCount: number };
    strongestCompetitor: null | { id: string; brand: string; hook: string; platform: CreativePlatform; healthScore: number };
    openPattern: null | { label: string; count: number; avgHealth: number; note: string };
    metaSignals: string[];
  };
  brief: CreativeRadarResult;
  humanCheckpoints: string[];
  nextActions: string[];
}

export class CreativeConfigError extends Error {}
export class CreativeUpstreamError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

const REMOTE_NODE_SCHEMA = z.object({
  id: z.string(),
  brand_id: z.string(),
  platform: z.enum(["meta", "tiktok"]),
  title: z.string().nullable(),
  health: z.enum(["thriving", "aging", "fatiguing", "declining"]),
  health_score: z.number(),
  run_days: z.number().int(),
  reach_bucket: z.enum(["high", "mid", "low"]).nullable(),
  variant_count: z.number().int(),
  creative_family_id: z.string().nullable(),
});

const REMOTE_WEB_SCHEMA = z.object({
  nodes: z.array(REMOTE_NODE_SCHEMA),
  competitor_nodes: z.array(REMOTE_NODE_SCHEMA),
});

const REMOTE_STATS_SCHEMA = z.object({
  total: z.number().int(),
  health_breakdown: z.object({
    thriving: z.number().int(),
    aging: z.number().int(),
    fatiguing: z.number().int(),
    declining: z.number().int(),
  }),
  fatiguing_count: z.number().int(),
});

const RADAR_RESULT_SCHEMA = z.object({
  text: z.string().min(1),
  thinking: z.array(z.string().min(1)).min(1),
  widget: z.enum([
    "genome_map",
    "saturation_chart",
    "opportunity_scorecard",
    "competitor_matrix",
    "creative_brief",
    "luma_concepts",
  ]),
  brief: z.object({
    title: z.string().min(1),
    narrative: z.string().min(1),
    metrics: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).min(1),
    alerts: z.array(z.object({ level: z.string().min(1), text: z.string().min(1) })).min(1),
    strategy: z.array(z.string().min(1)).min(1),
  }),
  suggestions: z.array(z.string().min(1)).min(1),
});

const REMOTE_RADAR_SCHEMA = z.object({
  ok: z.literal(true),
  source: z.string(),
  mode: z.enum(["live", "fallback"]),
  result: RADAR_RESULT_SCHEMA,
});

const QWEN_CHAT_COMPLETION_SCHEMA = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().min(1),
      }),
    }),
  ).min(1),
});

const QWEN_OVERVIEW_SCHEMA = z.object({
  brand: z.object({
    name: z.string().min(1),
    category: z.string().min(1),
  }),
  owned_ads: z.array(REMOTE_NODE_SCHEMA).min(1),
  competitor_ads: z.array(REMOTE_NODE_SCHEMA).min(1),
  meta_signals: z.array(z.string().min(1)).min(1),
});

interface CreativeRemoteConfig {
  baseUrl: string;
  brandId: string;
  brandName: string;
  category: string;
  timeoutMs: number;
}

interface QwenConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class CreativeIntelligenceService {
  async overview(): Promise<CreativeOverview> {
    const cfg = this.config(false);
    if (!cfg) {
      const qwen = this.qwenConfig();
      if (!qwen) {
        throw new CreativeConfigError(
          "Creative intelligence is not configured. Set either CREATIVE_INTEL_API_BASE_URL and CREATIVE_INTEL_BRAND_ID, or DASHSCOPE_API_KEY for Qwen web-search data.",
        );
      }
      return this.qwenOverview(qwen);
    }

    const [web, stats] = await Promise.all([
      this.fetchJson(`/api/v1/brands/${encodeURIComponent(cfg.brandId)}/web?include_competitors=true`, REMOTE_WEB_SCHEMA),
      this.fetchJson(`/api/v1/brands/${encodeURIComponent(cfg.brandId)}/stats`, REMOTE_STATS_SCHEMA),
    ]);

    const ads = web.nodes.map((node) => mapNode(node, cfg.brandName, "owned"));
    const competitorAds = web.competitor_nodes.map((node) => mapNode(node, node.brand_id, "competitor"));
    const families = buildFamilies(ads);
    const patterns = buildPatterns([...ads, ...competitorAds]);

    return {
      brand: { name: cfg.brandName, category: cfg.category },
      stats: {
        total: stats.total,
        fatiguingCount: stats.fatiguing_count,
        familyCount: families.length,
        avgHealth: average(ads.map((ad) => ad.healthScore)),
      },
      ads,
      competitorAds,
      families,
      patterns,
      metaSignals: buildMetaSignals(ads, competitorAds, patterns),
    };
  }

  async radar(prompt: string): Promise<CreativeRadarEnvelope> {
    const overview = await this.overview();
    return this.radarWithOverview(prompt, overview);
  }

  async autopilot(prompt?: string): Promise<CreativeAutopilotRun> {
    const overview = await this.overview();
    const weakestFamily = overview.families[0] ?? null;
    const strongestCompetitor = [...overview.competitorAds].sort((a, b) => b.healthScore - a.healthScore)[0] ?? null;
    const openPattern = overview.patterns.find((pattern) => pattern.status === "open") ?? null;
    const goal = `Decide the next highest-leverage creative action for ${overview.brand.name}.`;
    const missionPrompt = prompt?.trim() || buildAutopilotPrompt(overview, weakestFamily, strongestCompetitor, openPattern);
    const radar = await this.radarWithOverview(missionPrompt, overview);
    const recommendation = buildRecommendation(weakestFamily, strongestCompetitor, openPattern, radar.result);

    return {
      mode: "live",
      status: "pending_human_review",
      goal,
      prompt: missionPrompt,
      recommendation,
      evidence: {
        weakestFamily: weakestFamily
          ? {
              id: weakestFamily.id,
              label: weakestFamily.label,
              avgHealth: weakestFamily.avgHealth,
              adCount: weakestFamily.ads.length,
            }
          : null,
        strongestCompetitor: strongestCompetitor
          ? {
              id: strongestCompetitor.id,
              brand: strongestCompetitor.brand,
              hook: strongestCompetitor.hook,
              platform: strongestCompetitor.platform,
              healthScore: strongestCompetitor.healthScore,
            }
          : null,
        openPattern: openPattern
          ? {
              label: openPattern.label,
              count: openPattern.count,
              avgHealth: openPattern.avgHealth,
              note: openPattern.note,
            }
          : null,
        metaSignals: overview.metaSignals,
      },
      brief: radar.result,
      humanCheckpoints: [
        "Confirm the recommendation matches the brand strategy and margin profile.",
        "Confirm the proposed hook and format fit the intended platform.",
        "Confirm the brief is novel enough to avoid repeating fatigued creative.",
      ],
      nextActions: [
        recommendation.firstMove,
        ...radar.result.brief.strategy,
      ],
    };
  }

  private async radarWithOverview(
    prompt: string,
    overview: CreativeOverview,
  ): Promise<CreativeRadarEnvelope> {
    const qwen = this.qwenConfig();
    if (qwen) {
      return {
        mode: "live",
        result: await this.callQwenRadar(prompt, overview, qwen),
      };
    }

    const cfg = this.config(true)!;
    const radar = await this.fetchJson(
      "/api/v1/radar/chat",
      REMOTE_RADAR_SCHEMA,
      {
        method: "POST",
        body: JSON.stringify({
          prompt,
          brand: cfg.brandName,
          category: cfg.category,
          meta_signals: overview.metaSignals,
          campaign_context: `Owned creatives: ${overview.stats.total}; fatiguing: ${overview.stats.fatiguingCount}; families: ${overview.stats.familyCount}.`,
        }),
      },
    );

    if (radar.mode !== "live") {
      throw new CreativeUpstreamError(
        "Creative intelligence backend responded with fallback output instead of live data.",
        503,
      );
    }

    return {
      mode: "live",
      result: radar.result,
    };
  }

  private async callQwenRadar(
    prompt: string,
    overview: CreativeOverview,
    qwen: QwenConfig,
  ): Promise<CreativeRadarResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(`${qwen.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${qwen.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: qwen.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          enable_search: true,
          search_options: {
            forced_search: true,
            search_strategy: "turbo",
          },
          messages: [
            {
              role: "system",
              content: [
                "You are Signal's creative autopilot agent.",
                "Use only the supplied live creative data.",
                "Return strict JSON only. Do not wrap it in markdown.",
                "The JSON must match this shape: {\"text\":\"...\",\"thinking\":[\"...\"],\"widget\":\"creative_brief\",\"brief\":{\"title\":\"...\",\"narrative\":\"...\",\"metrics\":[{\"label\":\"...\",\"value\":\"...\"}],\"alerts\":[{\"level\":\"...\",\"text\":\"...\"}],\"strategy\":[\"...\"]},\"suggestions\":[\"...\"]}.",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                prompt,
                brand: overview.brand,
                stats: overview.stats,
                weakestFamilies: overview.families.slice(0, 4).map((family) => ({
                  id: family.id,
                  label: family.label,
                  avgHealth: family.avgHealth,
                  adCount: family.ads.length,
                })),
                competitorSignals: overview.competitorAds.slice(0, 8).map((ad) => ({
                  id: ad.id,
                  brand: ad.brand,
                  platform: ad.platform,
                  hook: ad.hook,
                  healthScore: ad.healthScore,
                })),
                patterns: overview.patterns.slice(0, 8),
                metaSignals: overview.metaSignals,
                requiredHumanCheckpoint: "Keep every recommendation pending operator approval before production handoff.",
              }),
            },
          ],
        }),
        signal: controller.signal,
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new CreativeUpstreamError(
          `Qwen Model Studio returned HTTP ${response.status}${raw ? `: ${raw.slice(0, 180)}` : ""}`,
          response.status,
        );
      }

      const completion = QWEN_CHAT_COMPLETION_SCHEMA.parse(JSON.parse(raw));
      return RADAR_RESULT_SCHEMA.parse(parseJsonContent(completion.choices[0]!.message.content));
    } catch (err) {
      if (err instanceof CreativeUpstreamError || err instanceof z.ZodError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new CreativeUpstreamError(`Qwen Model Studio request failed: ${message}`, 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async qwenOverview(qwen: QwenConfig): Promise<CreativeOverview> {
    const brandName = process.env.SIGNAL_TARGET_BRAND_NAME?.trim()
      || process.env.CREATIVE_INTEL_BRAND_NAME?.trim()
      || process.env.CREATIVE_INTEL_BRAND_ID?.trim()
      || "Celsius";
    const category = process.env.SIGNAL_TARGET_CATEGORY?.trim()
      || process.env.CREATIVE_INTEL_CATEGORY?.trim()
      || "energy drinks";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());

    try {
      const response = await fetch(`${qwen.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${qwen.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: qwen.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          enable_search: true,
          search_options: {
            forced_search: true,
            search_strategy: "turbo",
          },
          messages: [
            {
              role: "system",
              content: [
                "You are Signal's live creative-intelligence data collector.",
                "Use web search for current public evidence. Do not use examples, demo data, or invented IDs.",
                "Return strict JSON only. Do not wrap it in markdown.",
                "Return this shape: {\"brand\":{\"name\":\"...\",\"category\":\"...\"},\"owned_ads\":[{\"id\":\"...\",\"brand_id\":\"...\",\"platform\":\"meta|tiktok\",\"title\":\"...\",\"health\":\"thriving|aging|fatiguing|declining\",\"health_score\":0.7,\"run_days\":12,\"reach_bucket\":\"high|mid|low\",\"variant_count\":1,\"creative_family_id\":\"...\"}],\"competitor_ads\":[same shape],\"meta_signals\":[\"source-backed signal ...\"]}.",
                "Return at least one source-backed meta signal; include multiple signals when the search evidence supports them.",
                "Use concise source-backed titles, public competitor observations, and conservative health scores from visible recency, repetition, and saturation signals.",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                brand: brandName,
                category,
                task: "Find current public owned and competitor creative/ad signals for an autopilot creative refresh recommendation.",
                minimumOwnedAds: 3,
                minimumCompetitorAds: 3,
              }),
            },
          ],
        }),
        signal: controller.signal,
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new CreativeUpstreamError(
          `Qwen web-search overview returned HTTP ${response.status}${raw ? `: ${raw.slice(0, 180)}` : ""}`,
          response.status,
        );
      }

      const completion = QWEN_CHAT_COMPLETION_SCHEMA.parse(JSON.parse(raw));
      const qwenOverview = QWEN_OVERVIEW_SCHEMA.parse(parseJsonContent(completion.choices[0]!.message.content));
      const ads = qwenOverview.owned_ads.map((node) => mapNode(node, qwenOverview.brand.name, "owned"));
      const competitorAds = qwenOverview.competitor_ads.map((node) => mapNode(node, node.brand_id, "competitor"));
      const families = buildFamilies(ads);
      const patterns = buildPatterns([...ads, ...competitorAds]);

      return {
        brand: qwenOverview.brand,
        stats: {
          total: ads.length,
          fatiguingCount: ads.filter((ad) => ad.health === "fatiguing" || ad.health === "declining").length,
          familyCount: families.length,
          avgHealth: average(ads.map((ad) => ad.healthScore)),
        },
        ads,
        competitorAds,
        families,
        patterns,
        metaSignals: qwenOverview.meta_signals,
      };
    } catch (err) {
      if (err instanceof CreativeUpstreamError || err instanceof z.ZodError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new CreativeUpstreamError(`Qwen web-search overview request failed: ${message}`, 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  private config(required = true): CreativeRemoteConfig | null {
    const baseUrl = normalizeRemoteBaseUrl(process.env.CREATIVE_INTEL_API_BASE_URL);
    const brandId = process.env.CREATIVE_INTEL_BRAND_ID?.trim();
    if (!baseUrl || !brandId) {
      if (!required) return null;
      throw new CreativeConfigError(
        "Creative intelligence is not configured. Set CREATIVE_INTEL_API_BASE_URL and CREATIVE_INTEL_BRAND_ID.",
      );
    }
    return {
      baseUrl,
      brandId,
      brandName: process.env.CREATIVE_INTEL_BRAND_NAME?.trim() || brandId,
      category: process.env.CREATIVE_INTEL_CATEGORY?.trim() || "Creative Intelligence",
      timeoutMs: parseTimeoutMs(process.env.CREATIVE_INTEL_TIMEOUT_MS),
    };
  }

  private qwenConfig(): QwenConfig | null {
    const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
    if (!apiKey) return null;

    return {
      apiKey,
      baseUrl: normalizeQwenBaseUrl(process.env.QWEN_BASE_URL, process.env.WORKSPACE_ID),
      model: process.env.QWEN_MODEL?.trim() || "qwen-plus",
    };
  }

  private timeoutMs(): number {
    return parseTimeoutMs(process.env.CREATIVE_INTEL_TIMEOUT_MS);
  }

  private async fetchJson<T>(
    path: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<T> {
    const cfg = this.config(true)!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new CreativeUpstreamError(
          `Creative intelligence backend returned HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`,
          res.status,
        );
      }
      return schema.parse(await res.json());
    } catch (err) {
      if (err instanceof CreativeUpstreamError || err instanceof CreativeConfigError || err instanceof z.ZodError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new CreativeUpstreamError(`Creative intelligence backend request failed: ${message}`, 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildAutopilotPrompt(
  overview: CreativeOverview,
  weakestFamily: CreativeFamily | null,
  strongestCompetitor: CreativeAdNode | null,
  openPattern: CreativePattern | null,
): string {
  const weakestText = weakestFamily
    ? `Weakest owned family: ${weakestFamily.label} at ${Math.round(weakestFamily.avgHealth * 100)}/100 across ${weakestFamily.ads.length} creatives.`
    : "No weak family was identified.";
  const competitorText = strongestCompetitor
    ? `Strongest competitor signal: ${strongestCompetitor.brand} using ${strongestCompetitor.hook} on ${strongestCompetitor.platform} at ${Math.round(strongestCompetitor.healthScore * 100)}/100.`
    : "No strong competitor signal was returned.";
  const openText = openPattern
    ? `Open pattern territory: ${openPattern.label}.`
    : "No open pattern territory was returned.";

  return [
    `You are the creative autopilot agent for ${overview.brand.name} in ${overview.brand.category}.`,
    "Choose the next highest-leverage action for the team.",
    weakestText,
    competitorText,
    openText,
    "Return a practical creative brief with clear operator-review checkpoints.",
  ].join(" ");
}

function buildRecommendation(
  weakestFamily: CreativeFamily | null,
  strongestCompetitor: CreativeAdNode | null,
  openPattern: CreativePattern | null,
  radar: CreativeRadarResult,
): CreativeAutopilotRun["recommendation"] {
  if (weakestFamily && weakestFamily.avgHealth <= 0.65) {
    return {
      type: "refresh_family",
      title: `Refresh ${weakestFamily.label}`,
      rationale: `${weakestFamily.label} is the weakest owned family and is the highest-confidence fatigue problem in the portfolio.`,
      firstMove: `Retire or rewrite the weakest variants in ${weakestFamily.label} before launching new spend.`,
      expectedImpact: "Reduce fatigue and recover efficiency in the most deteriorated creative pocket.",
    };
  }

  if (openPattern) {
    return {
      type: "test_white_space",
      title: `Test ${openPattern.label}`,
      rationale: `${openPattern.label} is still underused enough to act as creative white-space.`,
      firstMove: `Launch 2-3 new variants around ${openPattern.label} with a fresh proof angle.`,
      expectedImpact: "Open a new creative territory before competitors saturate it.",
    };
  }

  if (strongestCompetitor) {
    return {
      type: "counter_competitor",
      title: `Counter ${strongestCompetitor.brand}`,
      rationale: `${strongestCompetitor.brand} currently has the strongest observed competitor signal.`,
      firstMove: `Draft a response concept around ${strongestCompetitor.hook} with a stronger native brand proof mechanic.`,
      expectedImpact: "Close competitor messaging gaps without copying fatigued market patterns.",
    };
  }

  return {
    type: "scale_winner",
    title: radar.brief.title,
    rationale: "The available signals do not show a severe weak spot, so the best move is to scale the healthiest direction.",
    firstMove: radar.brief.strategy[0] ?? "Launch one approved concept from the returned brief.",
    expectedImpact: "Turn the current healthiest brief direction into the next controlled test.",
  };
}

function mapNode(
  node: z.infer<typeof REMOTE_NODE_SCHEMA>,
  brand: string,
  scope: "owned" | "competitor",
): CreativeAdNode {
  const title = (node.title ?? "Untitled creative").trim();
  const familyId = node.creative_family_id ?? node.id;
  return {
    id: node.id,
    brand,
    scope,
    title,
    platform: node.platform,
    health: node.health,
    healthScore: node.health_score,
    runDays: node.run_days,
    reachBucket: node.reach_bucket ?? "low",
    variantCount: Math.max(node.variant_count, 1),
    creativeFamilyId: familyId,
    familyLabel: labelize(familyId),
    hook: inferHook(title),
    format: inferFormat(title, node.platform),
    cta: inferCta(title),
    proofStyle: inferProofStyle(title),
  };
}

function buildFamilies(ads: CreativeAdNode[]): CreativeFamily[] {
  const families = new Map<string, CreativeAdNode[]>();
  for (const ad of ads) {
    const list = families.get(ad.creativeFamilyId) ?? [];
    list.push(ad);
    families.set(ad.creativeFamilyId, list);
  }
  return [...families.entries()]
    .map(([id, members]) => ({
      id,
      label: members[0]!.familyLabel,
      ads: [...members].sort((a, b) => a.healthScore - b.healthScore),
      avgHealth: average(members.map((ad) => ad.healthScore)),
    }))
    .sort((a, b) => a.avgHealth - b.avgHealth);
}

function buildPatterns(ads: CreativeAdNode[]): CreativePattern[] {
  const order: Record<CreativePattern["status"], number> = {
    saturated: 0,
    open: 1,
    rising: 2,
  };
  const groups = new Map<string, CreativeAdNode[]>();
  for (const ad of ads) {
    const key = `${ad.hook}__${ad.cta}`;
    const list = groups.get(key) ?? [];
    list.push(ad);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const [hook, cta] = key.split("__");
      const avgHealth = average(group.map((ad) => ad.healthScore));
      const label = `${hook} + ${cta}`;
      const status: CreativePattern["status"] =
        group.length >= 3 && avgHealth < 0.6
          ? "saturated"
          : avgHealth >= 0.72
            ? "rising"
            : "open";
      const note =
        status === "saturated"
          ? "Repeated heavily and now losing momentum."
          : status === "rising"
            ? "Currently healthy and worth extending with fresh variants."
            : "Underused enough to test as a new territory.";
      return { label, count: group.length, avgHealth, status, note };
    })
    .sort((a, b) => order[a.status] - order[b.status]);
}

function buildMetaSignals(
  ads: CreativeAdNode[],
  competitorAds: CreativeAdNode[],
  patterns: CreativePattern[],
): string[] {
  const weakestFamily = buildFamilies(ads)[0];
  const strongestCompetitor = [...competitorAds].sort((a, b) => b.healthScore - a.healthScore)[0];
  const topOpen = patterns.find((pattern) => pattern.status === "open");
  return [
    weakestFamily
      ? `${weakestFamily.label} is the weakest owned family at ${Math.round(weakestFamily.avgHealth * 100)}/100.`
      : "No weak family identified in the owned portfolio.",
    strongestCompetitor
      ? `${strongestCompetitor.brand} is currently strongest with ${strongestCompetitor.hook} on ${strongestCompetitor.platform}.`
      : "No competitor creative nodes were returned by the upstream backend.",
    topOpen
      ? `Open territory: ${topOpen.label}.`
      : "No open territory was detected from the returned creatives.",
  ];
}

function inferHook(title: string): string {
  const lowered = title.toLowerCase();
  if (lowered.includes("founder")) return "founder authority";
  if (lowered.includes("creator") || lowered.includes("ugc")) return "creator-led proof";
  if (lowered.includes("discount") || lowered.includes("offer")) return "discount urgency";
  if (lowered.includes("testimonial")) return "testimonial";
  if (lowered.includes("comparison") || lowered.includes("teardown")) return "expert teardown";
  if (lowered.includes("routine")) return "routine payoff";
  return "benefit-led hook";
}

function inferFormat(title: string, platform: CreativePlatform): string {
  const lowered = title.toLowerCase();
  if (lowered.includes("montage")) return "montage";
  if (lowered.includes("voiceover")) return "voiceover";
  if (lowered.includes("explainer")) return "explainer";
  if (lowered.includes("comparison")) return "comparison walkthrough";
  return platform === "tiktok" ? "short-form social video" : "paid social video";
}

function inferCta(title: string): string {
  const lowered = title.toLowerCase();
  if (lowered.includes("book")) return "book consultation";
  if (lowered.includes("claim")) return "claim offer";
  if (lowered.includes("learn")) return "learn more";
  if (lowered.includes("see why")) return "see why";
  return "shop now";
}

function inferProofStyle(title: string): string {
  const lowered = title.toLowerCase();
  if (lowered.includes("screenshot")) return "screenshot proof";
  if (lowered.includes("review")) return "review quote";
  if (lowered.includes("before-after")) return "before-after proof";
  if (lowered.includes("comparison")) return "side-by-side proof";
  if (lowered.includes("creator")) return "creator testimony";
  return "product proof";
}

function labelize(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
}

function normalizeRemoteBaseUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CreativeConfigError("CREATIVE_INTEL_API_BASE_URL must be a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new CreativeConfigError("CREATIVE_INTEL_API_BASE_URL must use http or https.");
  }

  if (process.env.NODE_ENV === "production" && isLocalHostname(parsed.hostname)) {
    throw new CreativeConfigError(
      "CREATIVE_INTEL_API_BASE_URL must point to a real remote backend in production, not localhost or a private local hostname.",
    );
  }

  return parsed.toString().replace(/\/+$/, "");
}

function normalizeQwenBaseUrl(value: string | undefined, workspaceId: string | undefined): string {
  const raw = value?.trim() || defaultQwenBaseUrl(workspaceId);

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CreativeConfigError("QWEN_BASE_URL must be a valid absolute URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new CreativeConfigError("QWEN_BASE_URL must use https.");
  }

  return parsed.toString().replace(/\/+$/, "");
}

function defaultQwenBaseUrl(workspaceId: string | undefined): string {
  const id = workspaceId?.trim();
  if (id) {
    return `https://${id}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`;
  }
  return "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

function parseTimeoutMs(value: string | undefined): number {
  const timeoutMs = Number(value ?? "30000");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new CreativeConfigError("CREATIVE_INTEL_TIMEOUT_MS must be a number between 1000 and 120000.");
  }
  return timeoutMs;
}

function isLocalHostname(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  return lowered === "localhost" || lowered === "127.0.0.1" || lowered === "::1" || lowered.endsWith(".local");
}
