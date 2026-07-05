import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import type { CompanyIntelPort, GazettePort, NewsPort, XeroPort } from "@signal/core";
import { AnalyticsService } from "./services/analytics.service.js";
import { ActionsService } from "./services/actions.service.js";
import { ContextStore } from "./services/context-store.js";
import { IngestionService } from "./services/ingestion.service.js";
import { SignalsService } from "./services/signals.service.js";
import { AgentService } from "./services/agent.service.js";
import { ProposalStore } from "./services/proposal-store.js";
import { ProposalService } from "./services/proposal.service.js";
import { BriefService } from "./services/brief.service.js";
import { ImpactService } from "./services/impact.service.js";
import { AskService } from "./services/ask.service.js";
import { ChaseEmailDrafter } from "./llm/chase-email.js";
import type { GeminiClient } from "./llm/gemini.js";
import { analyticsRoutes } from "./routes/analytics.routes.js";
import { actionsRoutes } from "./routes/actions.routes.js";
import { intelligenceRoutes } from "./routes/intelligence.routes.js";
import { proposalsRoutes } from "./routes/proposals.routes.js";

export interface AppDeps {
  xero: XeroPort;
  intel: CompanyIntelPort;
  news: NewsPort;
  gazette: GazettePort;
  /** The LLM used for agent decisions + chase-email drafting (Gemini). */
  llm: GeminiClient;
  /** Owner identity + voice for outbound drafts. */
  owner?: { name: string; business: string; style: string };
  contextDir: string;
  proposalsDir: string;
  /** Last-known-snapshot file — served when Xero is rate-limited/unreachable. */
  snapshotCachePath?: string;
  cacheTtlMs?: number;
}

export interface AppServices {
  ingestion: IngestionService;
  signals: SignalsService;
}

/**
 * Build the Express app from injected dependencies. The server (server.ts) wires
 * the real adapters; tests wire the fakes — the app itself is identical in both
 * cases. Returns the services too so the server can hook the Companies House
 * stream into ingestion.
 */
export function createApp(deps: AppDeps): { app: Express; services: AppServices } {
  const analytics = new AnalyticsService(
    deps.xero,
    deps.cacheTtlMs,
    undefined,
    deps.snapshotCachePath,
  );
  const emailDrafter = new ChaseEmailDrafter(deps.llm, deps.owner);
  const actions = new ActionsService(deps.xero, analytics, emailDrafter);
  const store = new ContextStore(deps.contextDir);
  const ingestion = new IngestionService(analytics, deps.intel, deps.news, deps.gazette, store);
  const signals = new SignalsService(analytics, store, ingestion);
  const agent = new AgentService(signals, deps.llm);
  const proposalStore = new ProposalStore(deps.proposalsDir);
  const proposals = new ProposalService(agent, signals, analytics, actions, proposalStore, deps.llm);
  const briefs = new BriefService(analytics, signals, proposalStore, deps.llm);
  const impact = new ImpactService(analytics, proposalStore);
  const ask = new AskService(analytics, signals, impact, deps.llm);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/analytics", analyticsRoutes(analytics));
  app.use("/api/actions", actionsRoutes(actions));
  app.use("/api", intelligenceRoutes({ signals, store, ingestion, agent, briefs, impact, ask }));
  app.use("/api", proposalsRoutes(proposals));

  // 404
  app.use((_req, res) => res.status(404).json({ error: "NotFound" }));

  // Central error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    // eslint-disable-next-line no-console
    console.error("[api] error:", message);
    res.status(500).json({ error: "InternalServerError", message });
  });

  return { app, services: { ingestion, signals } };
}
