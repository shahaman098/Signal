import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { CreativeIntelligenceService } from "./services/creative-intelligence.service.js";
import { creativeRoutes } from "./routes/creative.routes.js";

export function createApp(): Express {
  const app = express();
  const creative = new CreativeIntelligenceService();

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") || randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/creative", creativeRoutes(creative));

  app.use((_req, res) =>
    res.status(404).json({
      error: "NotFound",
      code: "ROUTE_NOT_FOUND",
      requestId: String(res.locals.requestId ?? ""),
      message: "The requested route does not exist",
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    const requestId = String(res.locals.requestId ?? "");
    // eslint-disable-next-line no-console
    console.error(`[api] request=${requestId} error=${message}`);
    res.status(500).json({
      error: "InternalServerError",
      code: "INTERNAL_SERVER_ERROR",
      requestId,
      message,
    });
  });

  return app;
}
