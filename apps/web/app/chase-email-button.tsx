"use client";

import { useState } from "react";
import { api, type ChaseEmailDraft } from "../lib/api";
import { Mail } from "./icons";

/** Client component: requests a Claude-drafted chase email for one invoice. */
export function ChaseEmailButton({ invoiceId }: { invoiceId: string }) {
  const [draft, setDraft] = useState<ChaseEmailDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      setDraft(await api.draftChaseEmail(invoiceId, "friendly"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="btn" onClick={onClick} disabled={loading}>
        <Mail size={14} /> {loading ? "Drafting…" : "Draft chase email"}
      </button>
      {error && <div style={{ color: "var(--critical)", fontSize: 12, marginTop: 4 }}>{error}</div>}
      {draft && (
        <div className="draft">
          <div className="draft-subject">
            {draft.subject}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}> · via {draft.generatedBy}</span>
          </div>
          <pre>{draft.body}</pre>
        </div>
      )}
    </div>
  );
}
