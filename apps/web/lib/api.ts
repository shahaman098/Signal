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

export const api = {
  creativeOverview: () => get<CreativeOverview>("/api/creative/overview"),
  creativeRadar: (prompt: string) => post<CreativeRadarEnvelope>("/api/creative/radar", { prompt }),
  creativeAutopilot: (prompt?: string) => post<CreativeAutopilotRun>("/api/creative/autopilot", prompt ? { prompt } : {}),
};
