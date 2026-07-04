"use client";

import { useState } from "react";
import { api, type ChaseEmailDraft } from "../lib/api";

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
      <button onClick={onClick} disabled={loading} style={btn}>
        {loading ? "Drafting…" : "Draft chase email"}
      </button>
      {error && <div style={{ color: "#ff6b6b", fontSize: 12 }}>{error}</div>}
      {draft && (
        <details open style={{ marginTop: 6, maxWidth: 360 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#9aa0ad" }}>
            {draft.subject} · via {draft.generatedBy}
          </summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#c8ccd6" }}>{draft.body}</pre>
        </details>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "#2b64f5",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 12,
};
