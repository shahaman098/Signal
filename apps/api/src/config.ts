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
  anthropic: {
    apiKey: string;
    model: string;
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
    anthropic: {
      apiKey: env("ANTHROPIC_API_KEY"),
      model: env("CLAUDE_MODEL", "claude-opus-4-8"),
    },
    companiesHouse: {
      apiKey: env("COMPANIES_HOUSE_API_KEY"),
      streamKey: env("COMPANIES_HOUSE_STREAM_KEY"),
    },
    news: {
      apiKey: env("NEWS_API_KEY"),
    },
    contextDir: env("CONTEXT_DIR", "data/company-context"),
  };
}
