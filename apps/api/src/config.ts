/** Environment-driven configuration, parsed once at boot. */
export interface AppConfig {
  port: number;
  xeroAdapter: "mcp" | "fake";
  xero: {
    clientId: string;
    clientSecret: string;
    mcpCommand: string;
    mcpArgs: string[];
  };
  gemini: {
    apiKey: string;
    model: string;
  };
  /** Who emails come from, and how they should sound. */
  owner: {
    name: string;
    business: string;
    /** Free-text style hint fed to the LLM, e.g. "warm but direct, no corporate filler". */
    style: string;
  };
  companiesHouse: {
    apiKey: string;
    /** Separate credential — CH streaming keys are distinct from REST keys. */
    streamKey: string;
  };
  news: {
    apiKey: string;
  };
  contextDir: string;
  proposalsDir: string;
  /** Xero snapshot cache TTL — a real-org sweep is many MCP round-trips. */
  snapshotTtlMs: number;
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function loadConfig(): AppConfig {
  const adapter = env("XERO_ADAPTER", "fake");
  return {
    port: Number(env("PORT", "4000")),
    xeroAdapter: adapter === "mcp" ? "mcp" : "fake",
    xero: {
      clientId: env("XERO_CLIENT_ID"),
      clientSecret: env("XERO_CLIENT_SECRET"),
      mcpCommand: env("XERO_MCP_COMMAND", "npx"),
      mcpArgs: env("XERO_MCP_ARGS", "-y,@xeroapi/xero-mcp-server@latest")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    gemini: {
      apiKey: env("GEMINI_API_KEY"),
      // NB: there is no "gemini-3.2" — current lineup is 3.5-flash (default),
      // 3.1-flash-lite (cheapest) and 3.1-pro-preview.
      model: env("GEMINI_MODEL", "gemini-3.5-flash"),
    },
    owner: {
      name: env("OWNER_NAME", "Accounts"),
      business: env("BUSINESS_NAME", "our team"),
      style: env("CHASE_STYLE", ""),
    },
    companiesHouse: {
      apiKey: env("COMPANIES_HOUSE_API_KEY"),
      streamKey: env("COMPANIES_HOUSE_STREAM_KEY"),
    },
    news: {
      apiKey: env("NEWS_API_KEY"),
    },
    // Data dirs are ALWAYS adapter-scoped (…/fake vs …/mcp): demo and real data
    // must never share a store — fake-mode ingestion would prune real contexts,
    // and demo proposals would pollute the real approval history.
    contextDir: `${env("CONTEXT_DIR", "data/company-context")}/${adapter === "mcp" ? "mcp" : "fake"}`,
    proposalsDir: `${env("PROPOSALS_DIR", "data/proposals")}/${adapter === "mcp" ? "mcp" : "fake"}`,
    // 30min for real Xero (a sweep is ~20 API calls against a 5000/day quota);
    // 1min for the fake adapter where refreshes are free.
    snapshotTtlMs: Number(env("SNAPSHOT_TTL_MS", adapter === "mcp" ? "1800000" : "60000")),
  };
}
