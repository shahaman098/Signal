import { Router } from "express";
import { z } from "zod";
import {
  type CreativeAutopilotRun,
  CreativeConfigError,
  CreativeUpstreamError,
  type CreativeIntelligenceService,
} from "../services/creative-intelligence.service.js";

export function creativeRoutes(creative: CreativeIntelligenceService): Router {
  const router = Router();
  const radarSchema = z.object({ prompt: z.string().min(2).max(2000) });
  const autopilotSchema = z.object({ prompt: z.string().min(2).max(2000).optional() });

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

  return router;
}
