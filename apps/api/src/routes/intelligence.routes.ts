import { Router } from "express";
import type { AgentService } from "../services/agent.service.js";
import type { ContextStore } from "../services/context-store.js";
import type { IngestionService } from "../services/ingestion.service.js";
import type { SignalsService } from "../services/signals.service.js";

/**
 * Intelligence surface:
 *   GET  /api/signals              — prioritised signals (optionally ?category=)
 *   GET  /api/signals/summary      — counts by category/severity
 *   GET  /api/context              — all company context documents
 *   GET  /api/context/:contactId   — one company's full context (CH + news)
 *   POST /api/context/refresh      — re-ingest Companies House + news
 *   POST /api/agent/decide         — agent decisions with reasoning
 */
export function intelligenceRoutes(deps: {
  signals: SignalsService;
  store: ContextStore;
  ingestion: IngestionService;
  agent: AgentService;
}): Router {
  const router = Router();
  const { signals, store, ingestion, agent } = deps;

  router.get("/signals", async (req, res, next) => {
    try {
      const run = await signals.run();
      const category = req.query.category as string | undefined;
      res.json(category ? { ...run, signals: run.signals.filter((s) => s.category === category) } : run);
    } catch (err) {
      next(err);
    }
  });

  router.get("/signals/summary", async (_req, res, next) => {
    try {
      const run = await signals.run();
      res.json({
        asOf: run.asOf,
        total: run.signals.length,
        countsByCategory: run.countsByCategory,
        countsBySeverity: run.countsBySeverity,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/context", async (_req, res, next) => {
    try {
      res.json(await signals.getContexts());
    } catch (err) {
      next(err);
    }
  });

  router.get("/context/:contactId", async (req, res, next) => {
    try {
      const ctx = await store.load(req.params.contactId);
      if (!ctx) return res.status(404).json({ error: "NoContext", contactId: req.params.contactId });
      res.json(ctx);
    } catch (err) {
      next(err);
    }
  });

  router.post("/context/refresh", async (_req, res, next) => {
    try {
      res.json(await ingestion.refreshAll());
    } catch (err) {
      next(err);
    }
  });

  router.post("/agent/decide", async (_req, res, next) => {
    try {
      res.json(await agent.decide());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
