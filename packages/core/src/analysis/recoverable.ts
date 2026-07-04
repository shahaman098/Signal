import type { XeroSnapshot } from "../domain/types.js";
import { computePaymentPatterns, type PaymentPattern } from "./payment-pattern.js";
import { computeSlipRisk, type SlipRisk } from "./slip-risk.js";
import { round } from "./util.js";

export interface RecoverableItem {
  rank: number;
  invoiceId: string;
  contactId: string;
  amountDue: number;
  slipRisk: number;
  /** Rough probability the balance is recovered "soon" (1 − slipRisk). */
  recoveryLikelihood: number;
  /** amountDue × recoveryLikelihood — what you can realistically expect to collect. */
  expectedRecoverable: number;
}

export interface RecoverableSummary {
  totalOutstanding: number;
  totalExpectedRecoverable: number;
  items: RecoverableItem[];
}

/**
 * Rank overdue invoices by expected recoverable value: the balance weighted by
 * how likely it is to actually come in. High balances owed by reliable payers
 * rank above larger balances owed by chronic slippers.
 */
export function computeRecoverable(
  snapshot: XeroSnapshot,
  precomputed?: { patterns?: PaymentPattern[]; slipRisks?: SlipRisk[] },
): RecoverableSummary {
  const patterns = precomputed?.patterns ?? computePaymentPatterns(snapshot);
  const slipRisks = precomputed?.slipRisks ?? computeSlipRisk(snapshot, patterns);

  const items: RecoverableItem[] = slipRisks
    .map((risk) => {
      const recoveryLikelihood = round(1 - risk.score, 3);
      return {
        rank: 0,
        invoiceId: risk.invoiceId,
        contactId: risk.contactId,
        amountDue: risk.amountDue,
        slipRisk: risk.score,
        recoveryLikelihood,
        expectedRecoverable: round(risk.amountDue * recoveryLikelihood),
      };
    })
    .sort((a, b) => b.expectedRecoverable - a.expectedRecoverable)
    .map((item, i) => ({ ...item, rank: i + 1 }));

  return {
    totalOutstanding: round(items.reduce((s, i) => s + i.amountDue, 0)),
    totalExpectedRecoverable: round(items.reduce((s, i) => s + i.expectedRecoverable, 0)),
    items,
  };
}
