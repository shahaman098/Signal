import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import type { XeroPort } from "@signal/core";
import { AnalyticsService } from "./services/analytics.service.js";
import { ActionsService } from "./services/actions.service.js";
import { ChaseEmailDrafter } from "./llm/chase-email.js";
import { analyticsRoutes } from "./routes/analytics.routes.js";
import { actionsRoutes } from "./routes/actions.routes.js";

export interface AppDeps {
  xero: XeroPort;
  emailDrafter: ChaseEmailDrafter;
  cacheTtlMs?: number;
}

/**
 * Build the Express app from injected dependencies. The server (server.ts) wires
 * the real adapters; tests wire the FakeXeroAdapter — the app itself is identical
 * in both cases.
 */
export function createApp(deps: AppDeps): Express {
  const analytics = new AnalyticsService(deps.xero, deps.cacheTtlMs);
  const actions = new ActionsService(deps.xero, analytics, deps.emailDrafter);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/analytics", analyticsRoutes(analytics));
  app.use("/api/actions", actionsRoutes(actions));

  // 404
  app.use((_req, res) => res.status(404).json({ error: "NotFound" }));

  // Central error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    // eslint-disable-next-line no-console
    console.error("[api] error:", message);
    res.status(500).json({ error: "InternalServerError", message });
  });

  return app;
}
