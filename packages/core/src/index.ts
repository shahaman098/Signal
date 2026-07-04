// Domain
export * from "./domain/types.js";
export * from "./domain/schemas.js";
export * from "./domain/company.js";

// Ports
export type { XeroPort } from "./ports/xero-port.js";
export type { CompanyIntelPort, NewsPort } from "./ports/company-intel-port.js";

// Analysis
export * from "./analysis/util.js";
export * from "./analysis/payment-pattern.js";
export * from "./analysis/order-cadence.js";
export * from "./analysis/slip-risk.js";
export * from "./analysis/recoverable.js";
export * from "./analysis/churn.js";
export * from "./analysis/report.js";

// Signals
export * from "./signals/types.js";
export * from "./signals/engine.js";
export { cashRecoverySignals } from "./signals/cash-recovery.js";
export { revenueGrowthSignals } from "./signals/revenue-growth.js";
export { cashflowTimingSignals } from "./signals/cashflow-timing.js";
export { strategicSignals } from "./signals/strategic.js";
export { anomalySignals } from "./signals/anomaly.js";

// Demo data (used by the API's fake adapter and by tests)
export * from "./testing/demo-data.js";
export * from "./testing/demo-enriched.js";
