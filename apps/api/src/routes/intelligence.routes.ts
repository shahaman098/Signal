import { Router } from "express";
import { z } from "zod";
import type { AgentService } from "../services/agent.service.js";
import type { AskService } from "../services/ask.service.js";
import type { BriefService } from "../services/brief.service.js";
import type { ContextStore } from "../services/context-store.js";
import type { ImpactService } from "../services/impact.service.js";
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
  briefs: BriefService;
  impact: ImpactService;
  ask: AskService;
}): Router {
  const router = Router();
  const { signals, store, ingestion, agent, briefs, impact, ask } = deps;

  // Measure: the live "revenue & cash unlocked" ledger.
  router.get("/impact", async (_req, res, next) => {
    try {
      res.json(await impact.summary());
    } catch (err) {
      next(err);
    }
  });

  // Interrogate: ask anything about the analysis; answers are grounded in the
  // computed data (Gemini when configured, headline summary otherwise).
  const askSchema = z.object({ question: z.string().min(2).max(500) });
  router.post("/ask", async (req, res, next) => {
    try {
      const { question } = askSchema.parse(req.body ?? {});
      res.json(await ask.ask(question));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "ValidationError", details: err.flatten() });
      }
      next(err);
    }
  });

  // Unified evidence feed: news, Gazette notices and registry filings across
  // every counterparty, newest first.
  router.get("/sources", async (_req, res, next) => {
    try {
      res.json(await briefs.sources());
    } catch (err) {
      next(err);
    }
  });

  // The per-company dossier: context + metrics + series + signals + proposals
  // + a written brief composed from the data.
  router.get("/companies/:contactId/brief", async (req, res, next) => {
    try {
      const brief = await briefs.brief(req.params.contactId);
      if (!brief) return res.status(404).json({ error: "NoContext", contactId: req.params.contactId });
      res.json(brief);
    } catch (err) {
      next(err);
    }
  });

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

  // Human confirmation: pin a Companies House number to a contact. Pinned
  // matches refresh by number and are never re-searched.
  router.put("/context/:contactId/company-number", async (req, res, next) => {
    try {
      const companyNumber = String(req.body?.companyNumber ?? "").trim();
      if (!companyNumber) return res.status(400).json({ error: "companyNumber required" });
      res.json(await ingestion.confirmCompanyNumber(req.params.contactId, companyNumber));
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      if (/No context|not found/i.test(message)) return res.status(404).json({ error: message });
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
