import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSignalMcpServer } from "./signal-mcp.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? "8080");
const app = createMcpExpressApp({ host: HOST });

type ActiveTransport = SSEServerTransport | StreamableHTTPServerTransport;

const serversBySession = new Map<string, McpServer>();
const transportsBySession = new Map<string, ActiveTransport>();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "signal-mcp" });
});

app.all("/mcp", async (req, res) => {
  try {
    const sessionId = getSessionHeader(req.headers["mcp-session-id"]);
    let transport = sessionId ? transportsBySession.get(sessionId) : undefined;

    if (transport instanceof SSEServerTransport) {
      res.status(400).json(jsonRpcError("Bad Request: Session exists but uses SSE transport."));
      return;
    }

    if (!transport) {
      if (req.method !== "POST" || !isInitializeRequest(req.body)) {
        res.status(400).json(jsonRpcError("Bad Request: No valid Streamable HTTP session ID provided."));
        return;
      }

      const server = createSignalMcpServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      transport.onclose = () => closeSession(transport?.sessionId);
      await server.connect(transport);

      const newSessionId = transport.sessionId;
      if (!newSessionId) {
        throw new Error("Streamable HTTP transport failed to initialize a session ID.");
      }

      serversBySession.set(newSessionId, server);
      transportsBySession.set(newSessionId, transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    reportTransportError(res, error, "streamable HTTP");
  }
});

app.get("/sse", async (_req, res) => {
  try {
    const transport = new SSEServerTransport("/messages", res);
    const server = createSignalMcpServer();

    transport.onclose = () => closeSession(transport.sessionId);
    serversBySession.set(transport.sessionId, server);
    transportsBySession.set(transport.sessionId, transport);

    await server.connect(transport);
  } catch (error) {
    reportTransportError(res, error, "SSE");
  }
});

app.post("/messages", async (req, res) => {
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
  if (!sessionId) {
    res.status(400).json(jsonRpcError("Bad Request: Missing SSE sessionId query parameter."));
    return;
  }

  const transport = transportsBySession.get(sessionId);
  if (!(transport instanceof SSEServerTransport)) {
    res.status(400).json(jsonRpcError("Bad Request: No SSE transport found for the given session."));
    return;
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    reportTransportError(res, error, "SSE message");
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Signal MCP remote server listening on http://${HOST}:${PORT}`);
});

for (const signalName of ["SIGINT", "SIGTERM"] as const) {
  process.on(signalName, async () => {
    server.close();
    await closeAllSessions();
    process.exit(0);
  });
}

async function closeAllSessions() {
  for (const sessionId of [...transportsBySession.keys()]) {
    await closeSession(sessionId);
  }
}

async function closeSession(sessionId: string | undefined) {
  if (!sessionId) {
    return;
  }

  const transport = transportsBySession.get(sessionId);
  const server = serversBySession.get(sessionId);

  transportsBySession.delete(sessionId);
  serversBySession.delete(sessionId);

  await Promise.allSettled([
    transport?.close(),
    server?.close(),
  ]);
}

function getSessionHeader(headerValue: string | string[] | undefined): string | undefined {
  return Array.isArray(headerValue) ? headerValue[0] : headerValue;
}

function reportTransportError(
  res: {
    headersSent?: boolean;
    status: (code: number) => { json: (payload: unknown) => void };
  },
  error: unknown,
  label: string,
) {
  console.error(`Error handling Signal MCP ${label} request:`, error);
  if (!res.headersSent) {
    res.status(500).json(jsonRpcError("Internal server error"));
  }
}

function jsonRpcError(message: string) {
  return {
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message,
    },
    id: null,
  };
}
