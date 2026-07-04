import type { XeroSnapshot } from "../domain/types.js";
import { computeChurnSignals, type ChurnSignal } from "./churn.js";
import { computeOrderCadence, type OrderCadence } from "./order-cadence.js";
import { computePaymentPatterns, type PaymentPattern } from "./payment-pattern.js";
import { computeRecoverable, type RecoverableSummary } from "./recoverable.js";
import { computeSlipRisk, type SlipRisk } from "./slip-risk.js";

export interface ReceivablesReport {
  asOf: string;
  paymentPatterns: PaymentPattern[];
  orderCadence: OrderCadence[];
  slipRisk: SlipRisk[];
  recoverable: RecoverableSummary;
  churn: ChurnSignal[];
}

/**
 * Run the whole analysis layer once, sharing intermediate results so each
 * derivation is computed a single time. This is the aggregate the API exposes.
 */
export function buildReceivablesReport(snapshot: XeroSnapshot): ReceivablesReport {
  const paymentPatterns = computePaymentPatterns(snapshot);
  const orderCadence = computeOrderCadence(snapshot);
  const slipRisk = computeSlipRisk(snapshot, paymentPatterns);
  const recoverable = computeRecoverable(snapshot, { patterns: paymentPatterns, slipRisks: slipRisk });
  const churn = computeChurnSignals(snapshot, { cadence: orderCadence, patterns: paymentPatterns });

  return {
    asOf: snapshot.asOf,
    paymentPatterns,
    orderCadence,
    slipRisk,
    recoverable,
    churn,
  };
}
