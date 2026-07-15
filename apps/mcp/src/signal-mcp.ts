import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function createSignalMcpServer(): McpServer {
  const server = new McpServer({
    name: "signal-creative-tools",
    version: "0.1.0",
  });

  server.registerTool(
    "creative_overview",
    {
      description: "Fetch the latest owned and competitor creative signals from Signal.",
      inputSchema: {
        includeCompetitors: z.boolean().default(true),
      },
    },
    async () => {
      const result = await getJson("/api/creative/overview");
      return textToolResult(result);
    },
  );

  server.registerTool(
    "creative_radar",
    {
      description: "Ask Signal to produce a grounded Qwen creative brief for a specific prompt.",
      inputSchema: {
        prompt: z.string().min(2).max(2000),
      },
    },
    async ({ prompt }) => {
      const result = await postJson("/api/creative/radar", { prompt });
      return textToolResult(result);
    },
  );

  server.registerTool(
    "creative_autopilot",
    {
      description: "Ask Signal Autopilot Agent for the next recommended creative action. Prompt is optional; when omitted, Signal derives the agent goal from the latest portfolio state.",
      inputSchema: {
        prompt: z.string().min(2).max(2000).optional(),
      },
    },
    async ({ prompt }) => {
      const result = await postJson("/api/creative/autopilot", prompt ? { prompt } : {});
      return textToolResult(result);
    },
  );

  return server;
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${signalApiBaseUrl()}${path}`, {
    headers: {
      accept: "application/json",
    },
  });
  return parseResponse(response, `GET ${path}`);
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${signalApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseResponse(response, `POST ${path}`);
}

async function parseResponse(response: Response, requestLabel: string): Promise<unknown> {
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${requestLabel} failed with ${response.status}: ${raw.slice(0, 240)}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${requestLabel} returned invalid JSON: ${message}`);
  }
}

function textToolResult(result: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export function signalApiBaseUrl(): string {
  const raw = process.env.SIGNAL_API_BASE_URL?.trim() || "http://127.0.0.1:4000";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("SIGNAL_API_BASE_URL must be a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("SIGNAL_API_BASE_URL must use http or https.");
  }

  if (process.env.NODE_ENV === "production" && isLocalHostname(parsed.hostname)) {
    throw new Error(
      "SIGNAL_API_BASE_URL must point to a real remote Signal API in production, not localhost or a private local hostname.",
    );
  }

  return parsed.toString().replace(/\/+$/, "");
}

function isLocalHostname(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  return lowered === "localhost" || lowered === "127.0.0.1" || lowered === "::1" || lowered.endsWith(".local");
}
