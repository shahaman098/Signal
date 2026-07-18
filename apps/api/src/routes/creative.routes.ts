import { Router } from "express";
import { z } from "zod";
import {
  type CreativeAutopilotRun,
  CreativeConfigError,
  CreativeUpstreamError,
  type CreativeIntelligenceService,
} from "../services/creative-intelligence.service.js";
import {
  ReviewNotFoundError,
  ReviewStateError,
  type ReviewLedgerService,
} from "../services/review-ledger.service.js";

export function creativeRoutes(creative: CreativeIntelligenceService, reviews: ReviewLedgerService): Router {
  const router = Router();
  const radarSchema = z.object({ prompt: z.string().min(2).max(2000) });
  const autopilotSchema = z.object({ prompt: z.string().min(2).max(2000).optional() });
  const decisionSchema = z.object({
    action: z.enum(["approve", "reject", "request_revision"]),
    operator: z.string().min(2).max(120),
    note: z.string().max(2000).optional(),
    acknowledgedCheckpoints: z.boolean().optional(),
  });

  router.get("/overview", async (_req, res, next) => {
    try {
      res.json(await creative.overview());
    } catch (err) {
      if (err instanceof CreativeConfigError) {
        return res.status(503).json({ error: "CreativeNotConfigured", message: err.message });
      }
      if (err instanceof CreativeUpstreamError) {
        return res.status(err.status).json({ error: "CreativeUpstreamError", message: err.message });
      }
      next(err);
    }
  });

  router.post("/radar", async (req, res, next) => {
    try {
      const { prompt } = radarSchema.parse(req.body ?? {});
      res.json(await creative.radar(prompt));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "ValidationError", details: err.flatten() });
      }
      if (err instanceof CreativeConfigError) {
        return res.status(503).json({ error: "CreativeNotConfigured", message: err.message });
      }
      if (err instanceof CreativeUpstreamError) {
        return res.status(err.status).json({ error: "CreativeUpstreamError", message: err.message });
      }
      next(err);
    }
  });

  router.post("/autopilot", async (req, res, next) => {
    try {
      const { prompt } = autopilotSchema.parse(req.body ?? {});
      const result: CreativeAutopilotRun = await creative.autopilot(prompt);
      await reviews.registerRun(result);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "ValidationError", details: err.flatten() });
      }
      if (err instanceof CreativeConfigError) {
        return res.status(503).json({ error: "CreativeNotConfigured", message: err.message });
      }
      if (err instanceof CreativeUpstreamError) {
        return res.status(err.status).json({ error: "CreativeUpstreamError", message: err.message });
      }
      next(err);
    }
  });

  router.get("/runs", (_req, res) => {
    res.json({ runs: reviews.list() });
  });

  router.post("/runs/:runId/decision", async (req, res, next) => {
    try {
      const decision = decisionSchema.parse(req.body ?? {});
      res.json(await reviews.decide(req.params.runId, decision));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "ValidationError", details: err.flatten() });
      }
      if (err instanceof ReviewNotFoundError) {
        return res.status(404).json({ error: "RunNotFound", message: err.message });
      }
      if (err instanceof ReviewStateError) {
        return res.status(409).json({ error: "ReviewStateConflict", message: err.message });
      }
      next(err);
    }
  });

  return router;
}
