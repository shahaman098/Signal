import { Router } from "express";
import { z } from "zod";
import { ProposalConflictError, type ProposalService } from "../services/proposal.service.js";

/**
 * The Plan stage's HTTP surface:
 *   GET  /api/proposals               — full list (proposed first, by priority)
 *   POST /api/proposals/generate      — build/refresh from current signals
 *   POST /api/proposals/:id/approve   — execute (409 on conflict/staleness)
 *   POST /api/proposals/:id/reject    — decline with optional note
 */
export function proposalsRoutes(proposals: ProposalService): Router {
  const router = Router();

  router.get("/proposals", async (_req, res, next) => {
    try {
      res.json(await proposals.list());
    } catch (err) {
      next(err);
    }
  });

  router.post("/proposals/generate", async (_req, res, next) => {
    try {
      res.json(await proposals.generate());
    } catch (err) {
      next(err);
    }
  });

  router.post("/proposals/:id/approve", async (req, res, next) => {
    try {
      const force = req.query.force === "true";
      res.json(await proposals.approve(req.params.id, force));
    } catch (err) {
      if (err instanceof ProposalConflictError) {
        return res.status(409).json({ error: err.code, message: err.message });
      }
      next(err);
    }
  });

  const rejectSchema = z.object({ note: z.string().max(500).optional() });
  router.post("/proposals/:id/reject", async (req, res, next) => {
    try {
      const { note } = rejectSchema.parse(req.body ?? {});
      res.json(await proposals.reject(req.params.id, note));
    } catch (err) {
      if (err instanceof ProposalConflictError) {
        return res.status(409).json({ error: err.code, message: err.message });
      }
      next(err);
    }
  });

  return router;
}
