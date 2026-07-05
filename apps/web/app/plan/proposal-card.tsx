"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ActionProposal } from "../../lib/api";
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CircleCheck,
  Clock,
  ExternalLink,
  InfoCircle,
  Mail,
  XCircle,
  Zap,
} from "../icons";
import { MicroChart } from "../micro-chart";

/**
 * One proposal: the decision, the chain of inputs that produced it (reasoning,
 * metrics, comparison charts, government files & news evidence), and the
 * approve/reject controls.
 */
export function ProposalCard({ proposal }: { proposal: ActionProposal }) {
  const router = useRouter();
  // Collapsed by default — 20 auto-expanded reasoning chains is a wall, not a queue.
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<ActionProposal>(proposal);

  async function act(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      const updated = kind === "approve" ? await api.approveProposal(live.id) : await api.rejectProposal(live.id);
      setLive(updated);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const p = live;
  return (
    <div className={`proposal ${p.status}`}>
      <button className="proposal-head" onClick={() => setOpen(!open)}>
        <StatusBadge status={p.status} auto={p.autoExecuted} />
        <SeverityDot severity={p.severity} />
        <span className="proposal-title">{p.title}</span>
        {p.verification && (
          <span
            className={`badge ${p.verification.verdict === "confirmed" ? "good" : "warning"}`}
            title={p.verification.note}
          >
            {p.verification.verdict === "confirmed" ? <CircleCheck size={12} /> : <AlertTriangle size={12} />}
            {p.verification.verdict === "confirmed" ? "AI-verified" : "check data"}
          </span>
        )}
        <span className="chip">{p.action.kind}</span>
        <span className="proposal-meta">
          {p.reasoning.decision} · {p.reasoning.decidedBy}
        </span>
      </button>

      {open && (
        <div className="proposal-body">
          {/* Decision / thought */}
          <div className="proposal-section">
            <h4>Decision</h4>
            <p className="reason" style={{ maxWidth: "none" }}>{p.reasoning.decisionReasoning}</p>
          </div>

          {/* Chain of reasoning from the detector */}
          <div className="proposal-section">
            <h4>Why this fired</h4>
            <ol className="reason-chain">
              {p.reasoning.signalReasoning.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ol>
          </div>

          {/* Input data: metrics + comparison charts */}
          {(p.inputs.metrics.length > 0 || p.inputs.series.length > 0) && (
            <div className="proposal-section">
              <h4>Input data{p.contactName ? ` — ${p.contactName}` : ""}</h4>
              <div className="metric-chips">
                {p.inputs.metrics.map((m) => (
                  <span key={m.label} className={`metric-chip ${m.tone ?? "neutral"}`}>
                    <span className="metric-label">{m.label}</span> {m.value}
                  </span>
                ))}
              </div>
              <div className="chart-grid">
                {p.inputs.series.map((s) => (
                  <MicroChart key={s.id} series={s} />
                ))}
              </div>
            </div>
          )}

          {/* Evidence: registry filings, gazette notices, news */}
          {p.reasoning.evidence.length > 0 && (
            <div className="proposal-section">
              <h4>Evidence</h4>
              <ul className="evidence-list">
                {p.reasoning.evidence.map((e, i) => (
                  <li key={i}>
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} /> {e.label}
                      </a>
                    ) : (
                      <span style={{ color: "var(--ink-2)" }}>{e.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Prepared payload the human is approving */}
          {p.prepared && p.status === "proposed" && (
            <div className="proposal-section">
              <h4>Prepared quote — this exact payload is what approval sends</h4>
              <table className="data">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {p.prepared.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td>{li.description}</td>
                      <td className="num">{li.quantity}</td>
                      <td className="num">{li.unitAmount}</td>
                      <td className="num">{li.lineAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Outcome */}
          {p.result && (
            <div className="proposal-section outcome">
              <h4>Outcome</h4>
              {p.result.deepLink && (
                <p>
                  <CircleCheck size={14} style={{ color: "var(--good-text)", verticalAlign: "-2px" }} />{" "}
                  Created in Xero —{" "}
                  <a href={p.result.deepLink} target="_blank" rel="noreferrer">
                    <ExternalLink size={12} /> open {p.result.xeroId?.slice(0, 8)}…
                  </a>
                </p>
              )}
              {p.result.emailDraft && (
                <div className="draft" style={{ maxWidth: "none" }}>
                  <div className="draft-subject">
                    <Mail size={13} style={{ verticalAlign: "-2px" }} /> {p.result.emailDraft.subject}
                    <span style={{ color: "var(--muted)", fontWeight: 400 }}> · via {p.result.emailDraft.generatedBy}</span>
                  </div>
                  <pre>{p.result.emailDraft.body}</pre>
                </div>
              )}
              {p.result.note && <p className="reason" style={{ maxWidth: "none" }}>{p.result.note}</p>}
            </div>
          )}
          {p.failure && (
            <div className="proposal-section">
              <h4 style={{ color: "var(--critical)" }}>Execution failed</h4>
              <p className="reason">{p.failure.message}</p>
            </div>
          )}
          {p.resolution?.note && <p className="reason">{p.resolution.note}</p>}

          {/* Controls */}
          {p.status === "proposed" && (
            <div className="proposal-actions">
              <button className="btn primary" disabled={busy !== null} onClick={() => act("approve")}>
                <Zap size={14} /> {busy === "approve" ? "Executing…" : "Approve & execute"}
              </button>
              <button className="btn" disabled={busy !== null} onClick={() => act("reject")}>
                <XCircle size={14} /> {busy === "reject" ? "…" : "Reject"}
              </button>
              {error && <span style={{ color: "var(--critical)", fontSize: 12.5 }}>{error}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, auto }: { status: ActionProposal["status"]; auto?: boolean }) {
  const map: Record<ActionProposal["status"], { cls: string; icon: React.ReactNode; label: string }> = {
    proposed: { cls: "warning", icon: <Clock size={13} />, label: "awaiting review" },
    approved: { cls: "warning", icon: <Zap size={13} />, label: "executing" },
    executed: { cls: "good", icon: <CircleCheck size={13} />, label: auto ? "auto-executed" : "executed" },
    rejected: { cls: "neutral", icon: <XCircle size={13} />, label: "rejected" },
    failed: { cls: "critical", icon: <AlertOctagon size={13} />, label: "failed" },
    superseded: { cls: "neutral", icon: <Calendar size={13} />, label: "superseded" },
  };
  const { cls, icon, label } = map[status];
  return (
    <span className={`badge ${cls}`}>
      {icon} {label}
    </span>
  );
}

function SeverityDot({ severity }: { severity: ActionProposal["severity"] }) {
  const icon =
    severity === "urgent" ? (
      <AlertOctagon size={14} style={{ color: "var(--critical)" }} />
    ) : severity === "high" ? (
      <AlertTriangle size={14} style={{ color: "var(--serious)" }} />
    ) : severity === "medium" ? (
      <Clock size={14} style={{ color: "#9a6b00" }} />
    ) : (
      <InfoCircle size={14} style={{ color: "var(--muted)" }} />
    );
  return <span title={severity}>{icon}</span>;
}
