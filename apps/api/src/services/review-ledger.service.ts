import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CreativeAutopilotRun } from "./creative-intelligence.service.js";

export type ReviewDecisionAction = "approve" | "reject" | "request_revision";
export type ReviewStatus = "pending_human_review" | "approved" | "rejected" | "revision_requested";

export interface ReviewDecision {
  action: ReviewDecisionAction;
  operator: string;
  note: string | null;
  acknowledgedCheckpoints: boolean;
  decidedAt: string;
}

export interface ReviewRecord {
  runId: string;
  goal: string;
  recommendationTitle: string;
  recommendationType: string;
  trustVerdict: string;
  trustConfidence: number;
  humanCheckpoints: string[];
  status: ReviewStatus;
  createdAt: string;
  decision: ReviewDecision | null;
}

export class ReviewNotFoundError extends Error {}
export class ReviewStateError extends Error {}

const DECISION_STATUS: Record<ReviewDecisionAction, ReviewStatus> = {
  approve: "approved",
  reject: "rejected",
  request_revision: "revision_requested",
};

/**
 * Enforces the human-review gate: every autopilot run is registered as
 * pending, an approval requires explicit checkpoint acknowledgement, and
 * every decision is appended to a durable JSONL audit trail.
 */
export class ReviewLedgerService {
  private readonly records = new Map<string, ReviewRecord>();
  private readonly ledgerPath: string;

  constructor(ledgerPath?: string) {
    this.ledgerPath = resolve(
      ledgerPath ?? process.env.SIGNAL_REVIEW_LEDGER_PATH ?? "output/review-ledger.jsonl",
    );
  }

  async registerRun(run: CreativeAutopilotRun): Promise<ReviewRecord> {
    const record: ReviewRecord = {
      runId: run.runId,
      goal: run.goal,
      recommendationTitle: run.recommendation.title,
      recommendationType: run.recommendation.type,
      trustVerdict: run.trust.verdict,
      trustConfidence: run.trust.confidence,
      humanCheckpoints: run.humanCheckpoints,
      status: "pending_human_review",
      createdAt: new Date().toISOString(),
      decision: null,
    };
    this.records.set(record.runId, record);
    await this.append({ event: "run_registered", record });
    return record;
  }

  async decide(
    runId: string,
    input: { action: ReviewDecisionAction; operator: string; note?: string; acknowledgedCheckpoints?: boolean },
  ): Promise<ReviewRecord> {
    const record = this.records.get(runId);
    if (!record) {
      throw new ReviewNotFoundError(`No autopilot run is registered with id ${runId}.`);
    }
    if (record.status !== "pending_human_review") {
      throw new ReviewStateError(
        `Run ${runId} was already decided as ${record.status}; the audit trail is append-only.`,
      );
    }
    if (input.action === "approve" && input.acknowledgedCheckpoints !== true) {
      throw new ReviewStateError(
        "Approval requires acknowledgedCheckpoints: true. Confirm every human checkpoint before approving the handoff.",
      );
    }

    record.status = DECISION_STATUS[input.action];
    record.decision = {
      action: input.action,
      operator: input.operator,
      note: input.note?.trim() || null,
      acknowledgedCheckpoints: input.acknowledgedCheckpoints === true,
      decidedAt: new Date().toISOString(),
    };
    await this.append({ event: "run_decided", record });
    return record;
  }

  list(): ReviewRecord[] {
    return [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async append(entry: { event: string; record: ReviewRecord }): Promise<void> {
    await mkdir(dirname(this.ledgerPath), { recursive: true });
    await appendFile(this.ledgerPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
  }
}
