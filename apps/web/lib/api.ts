const SERVER_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

function baseUrl(): string {
  return typeof window === "undefined" ? SERVER_BASE : "";
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: string; message?: string };
      detail = [err.error, err.message].filter(Boolean).join(": ");
    } catch {
      // non-JSON error body
    }
    throw new Error(detail || `POST ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

function ensureStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/(?<=[.;])\s+|\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function compactSentence(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  if (normalized.length <= 88) return normalized;
  return `${normalized.slice(0, 85).trimEnd()}...`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

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

export type CreativeWidget = string;

export interface CreativeBriefMetric {
  label: string;
  value: string;
}

export interface CreativeBriefAlert {
  level: string;
  text: string;
}

export interface CreativeBrief {
  title: string;
  narrative: string;
  metrics: CreativeBriefMetric[];
  alerts: CreativeBriefAlert[];
  strategy: string[];
}

export interface CreativeRadarResult {
  text: string;
  thinking: string[];
  widget: CreativeWidget;
  brief: CreativeBrief;
  suggestions: string[];
}

export interface CreativeRadarEnvelope {
  mode: "live";
  result: CreativeRadarResult;
  provider?: string;
  model?: string;
}

export interface CreativeEvidence {
  weakestFamily: null | { id: string; label: string; avgHealth: number; adCount: number };
  strongestCompetitor: null | {
    id: string;
    brand: string;
    hook: string;
    platform: CreativePlatform;
    healthScore: number;
  };
  openPattern: null | { label: string; count: number; avgHealth: number; note: string };
  metaSignals: string[];
  bullets: string[];
}

export interface CreativeRecommendation {
  type: string;
  title: string;
  rationale: string;
  firstMove: string;
  expectedImpact: string;
}

export interface CreativeAutopilotRun {
  mode: "live";
  status: string;
  goal: string;
  prompt: string;
  provider?: string;
  model?: string;
  recommendation: CreativeRecommendation;
  evidence: CreativeEvidence;
  brief: CreativeRadarResult;
  humanCheckpoints: string[];
  nextActions: string[];
}

type LocalCreativeRadarEnvelope = {
  mode: "live";
  result: {
    text: string;
    thinking: string[];
    widget: string;
    brief: {
      title: string;
      narrative: string;
      metrics: { label: string; value: string }[];
      alerts: { level: string; text: string }[];
      strategy: string[];
    };
    suggestions: string[];
  };
};

type LocalCreativeAutopilotRun = {
  mode: "live";
  status: string;
  goal: string;
  prompt: string;
  recommendation: {
    type: string;
    title: string;
    rationale: string;
    firstMove: string;
    expectedImpact: string;
  };
  evidence: {
    weakestFamily: null | { id: string; label: string; avgHealth: number; adCount: number };
    strongestCompetitor: null | {
      id: string;
      brand: string;
      hook: string;
      platform: CreativePlatform;
      healthScore: number;
    };
    openPattern: null | { label: string; count: number; avgHealth: number; note: string };
    metaSignals: string[];
  };
  brief: LocalCreativeRadarEnvelope["result"];
  humanCheckpoints: string[];
  nextActions: string[];
};

type StandaloneCreativeResult = {
  text?: string;
  thinking?: string | string[];
  widget?: string;
  brief?: string;
  suggestions?: string[];
  recommendation?: string;
  evidence?: string[];
  humanCheckpoints?: string[];
  nextActions?: string[];
};

type StandaloneCreativeAutopilotRun = {
  mode?: "live";
  status?: string;
  provider?: string;
  model?: string;
  goal?: string;
  result?: StandaloneCreativeResult;
};

function normalizeBrief(raw: unknown, fallbackTitle: string): CreativeBrief {
  const brief = asRecord(raw);
  const metrics = Array.isArray(brief.metrics)
    ? brief.metrics
        .map((item) => asRecord(item))
        .map((item) => ({
          label: asText(item.label, "Metric"),
          value: asText(item.value, "Live"),
        }))
    : [];
  const alerts = Array.isArray(brief.alerts)
    ? brief.alerts
        .map((item) => asRecord(item))
        .map((item) => ({
          level: asText(item.level, "review"),
          text: asText(item.text),
        }))
        .filter((item) => item.text)
    : [];

  return {
    title: asText(brief.title, fallbackTitle),
    narrative: asText(brief.narrative),
    metrics,
    alerts,
    strategy: ensureStrings(brief.strategy),
  };
}

function normalizeRadarResult(raw: unknown, goal: string): CreativeRadarResult {
  const record = asRecord(raw);
  const suggestions = ensureStrings(record.suggestions);
  const checkpoints = ensureStrings(record.humanCheckpoints);
  const actions = ensureStrings(record.nextActions);
  const evidenceBullets = ensureStrings(record.evidence);

  if (record.brief && typeof record.brief === "object") {
    return {
      text: asText(record.text, goal),
      thinking: ensureStrings(record.thinking),
      widget: asText(record.widget, "creative_brief"),
      brief: normalizeBrief(record.brief, asText(asRecord(record.brief).title, "Creative brief")),
      suggestions,
    };
  }

  const narrative = asText(record.brief, asText(record.text, goal));
  const titleSource = asText(record.recommendation, narrative || goal);

  return {
    text: asText(record.text, goal),
    thinking: ensureStrings(record.thinking),
    widget: asText(record.widget, "live_creative_brief"),
    brief: {
      title: compactSentence(titleSource, "Recommended next move"),
      narrative,
      metrics: [
        { label: "Evidence", value: String(evidenceBullets.length) },
        { label: "Checks", value: String(checkpoints.length) },
        { label: "Moves", value: String(actions.length) },
      ],
      alerts: checkpoints.slice(0, 3).map((text) => ({ level: "review", text })),
      strategy: suggestions,
    },
    suggestions,
  };
}

function normalizeRadarEnvelope(raw: LocalCreativeRadarEnvelope | StandaloneCreativeAutopilotRun): CreativeRadarEnvelope {
  if ("result" in raw && raw.result && typeof raw.result === "object" && "brief" in raw.result) {
    const record = raw as StandaloneCreativeAutopilotRun;
    return {
      mode: "live",
      provider: record.provider,
      model: record.model,
      result: normalizeRadarResult(record.result, asText(record.goal, "Live creative brief")),
    };
  }

  const local = raw as LocalCreativeRadarEnvelope;
  return {
    mode: local.mode,
    result: normalizeRadarResult(local.result, "Creative brief"),
  };
}

function normalizeAutopilot(raw: LocalCreativeAutopilotRun | StandaloneCreativeAutopilotRun): CreativeAutopilotRun {
  if ("recommendation" in raw && raw.recommendation && typeof raw.recommendation === "object" && "brief" in raw) {
    const local = raw as LocalCreativeAutopilotRun;
    return {
      mode: local.mode,
      status: local.status,
      goal: local.goal,
      prompt: local.prompt,
      recommendation: local.recommendation,
      evidence: {
        weakestFamily: local.evidence.weakestFamily,
        strongestCompetitor: local.evidence.strongestCompetitor,
        openPattern: local.evidence.openPattern,
        metaSignals: local.evidence.metaSignals,
        bullets: [],
      },
      brief: normalizeRadarResult(local.brief, local.goal),
      humanCheckpoints: local.humanCheckpoints,
      nextActions: local.nextActions,
    };
  }

  const standalone = raw as StandaloneCreativeAutopilotRun;
  const result = asRecord(standalone.result);
  const goal = asText(standalone.goal, "Live creative review");
  const recommendation = asText(result.recommendation, asText(result.text, goal));
  const brief = normalizeRadarResult(result, goal);
  const checkpoints = ensureStrings(result.humanCheckpoints);
  const nextActions = ensureStrings(result.nextActions);
  const evidenceBullets = ensureStrings(result.evidence);

  return {
    mode: "live",
    status: asText(standalone.status, "pending_human_review"),
    goal,
    prompt: goal,
    provider: standalone.provider,
    model: standalone.model,
    recommendation: {
      type: "live_operator_review",
      title: compactSentence(recommendation, "Recommended next move"),
      rationale: brief.text,
      firstMove: recommendation,
      expectedImpact: brief.brief.narrative,
    },
    evidence: {
      weakestFamily: null,
      strongestCompetitor: null,
      openPattern: null,
      metaSignals: [],
      bullets: evidenceBullets,
    },
    brief,
    humanCheckpoints: checkpoints,
    nextActions,
  };
}

export const api = {
  creativeOverview: () => get<CreativeOverview>("/api/creative/overview"),
  creativeRadar: async (prompt: string) =>
    normalizeRadarEnvelope(
      await post<LocalCreativeRadarEnvelope | StandaloneCreativeAutopilotRun>("/api/creative/radar", { prompt }),
    ),
  creativeAutopilot: async (prompt?: string) =>
    normalizeAutopilot(
      await post<LocalCreativeAutopilotRun | StandaloneCreativeAutopilotRun>(
        "/api/creative/autopilot",
        prompt ? { prompt } : {},
      ),
    ),
};
