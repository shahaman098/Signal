// Domain
export * from "./domain/types.js";
export * from "./domain/schemas.js";

// Ports
export type { XeroPort } from "./ports/xero-port.js";

// Analysis
export * from "./analysis/util.js";
export * from "./analysis/payment-pattern.js";
export * from "./analysis/order-cadence.js";
export * from "./analysis/slip-risk.js";
export * from "./analysis/recoverable.js";
export * from "./analysis/churn.js";
export * from "./analysis/report.js";

// Demo data (used by the API's fake adapter and by tests)
export * from "./testing/demo-data.js";
