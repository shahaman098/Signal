import { Router } from "express";
import type { AnalyticsService } from "../services/analytics.service.js";

/** Read + derive endpoints. */
export function analyticsRoutes(analytics: AnalyticsService): Router {
  const router = Router();

  router.get("/snapshot", async (req, res, next) => {
    try {
      res.json(await analytics.getSnapshot(req.query.force === "true"));
    } catch (err) {
      next(err);
    }
  });

  // The full analysis report (payment patterns, cadence, slip-risk, recoverable, churn).
  router.get("/report", async (req, res, next) => {
    try {
      res.json(await analytics.getReport(req.query.force === "true"));
    } catch (err) {
      next(err);
    }
  });

  router.get("/contacts", async (_req, res, next) => {
    try {
      res.json(await analytics.getContacts());
    } catch (err) {
      next(err);
    }
  });

  // Individual derivations, for dashboards that want just one slice.
  const slice = <K extends keyof Awaited<ReturnType<AnalyticsService["getReport"]>>>(key: K) =>
    async (_req: unknown, res: import("express").Response, next: import("express").NextFunction) => {
      try {
        const report = await analytics.getReport();
        res.json(report[key]);
      } catch (err) {
        next(err);
      }
    };

  router.get("/payment-patterns", slice("paymentPatterns"));
  router.get("/order-cadence", slice("orderCadence"));
  router.get("/slip-risk", slice("slipRisk"));
  router.get("/recoverable", slice("recoverable"));
  router.get("/churn", slice("churn"));

  return router;
}
