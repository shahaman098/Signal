"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, type GenerateProposalsResult } from "../../lib/api";
import { Sparkles } from "../icons";

/** Runs signal detection + agent decisions and refreshes the proposal list. */
export function GenerateButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateProposalsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.generateProposals());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button className="btn primary" onClick={onClick} disabled={busy}>
        <Sparkles size={15} /> {busy ? "Analysing…" : "Generate proposals"}
      </button>
      {result && (
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {result.created} new · {result.updated} updated · {result.autoExecuted} drafts auto-executed ·{" "}
          {result.superseded} superseded · {result.unchanged} unchanged
        </span>
      )}
      {error && <span style={{ color: "var(--critical)", fontSize: 12.5 }}>{error}</span>}
    </div>
  );
}
