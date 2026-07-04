import { Router } from "express";
import {
  createInvoiceDraftInputSchema,
  createPaymentInputSchema,
  createQuoteInputSchema,
} from "@signal/core";
import { z } from "zod";
import { ActionsService, NotFoundError } from "../services/actions.service.js";

/** Write endpoints: quotes, draft invoices, payments, and chase-email drafts. */
export function actionsRoutes(actions: ActionsService): Router {
  const router = Router();

  router.post("/quotes", validate(createQuoteInputSchema), async (req, res, next) => {
    try {
      res.status(201).json(await actions.createQuote(req.body));
    } catch (err) {
      next(err);
    }
  });

  router.post("/invoices/draft", validate(createInvoiceDraftInputSchema), async (req, res, next) => {
    try {
      res.status(201).json(await actions.createInvoiceDraft(req.body));
    } catch (err) {
      next(err);
    }
  });

  router.post("/payments", validate(createPaymentInputSchema), async (req, res, next) => {
    try {
      res.status(201).json(await actions.createPayment(req.body));
    } catch (err) {
      next(err);
    }
  });

  // Flagship: reactivation-offer quote proposals for churn-risk customers.
  router.get("/reactivation-proposals", async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json(await actions.proposeReactivationQuotes(limit));
    } catch (err) {
      next(err);
    }
  });

  // Chase email — drafted by Claude, returned to the caller (not written to Xero).
  const chaseSchema = z.object({ tone: z.enum(["friendly", "firm"]).optional() });
  router.post("/invoices/:invoiceId/chase-email", async (req, res, next) => {
    try {
      const { tone } = chaseSchema.parse(req.body ?? {});
      res.json(await actions.draftChaseEmail(req.params.invoiceId, { tone }));
    } catch (err) {
      if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
      next(err);
    }
  });

  return router;
}

function validate(schema: z.ZodTypeAny) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "ValidationError", details: parsed.error.flatten() });
    }
    req.body = parsed.data;
    next();
  };
}
