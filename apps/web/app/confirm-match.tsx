"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyCandidate } from "@signal/core";
import { api } from "../lib/api";
import { CircleCheck } from "./icons";

/**
 * When no automatic Companies House match was safe, the human picks from the
 * top search candidates — pinning the number so ingestion never re-guesses.
 */
export function ConfirmMatch({ contactId, candidates }: { contactId: string; candidates: CompanyCandidate[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(candidates[0]?.companyNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) return <span className="empty">no verified match</span>;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.confirmCompanyNumber(contactId, selected);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{ fontSize: 12, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--hairline)", background: "var(--surface)", maxWidth: 220 }}
      >
        {candidates.map((c) => (
          <option key={c.companyNumber} value={c.companyNumber}>
            {c.title} ({c.companyNumber}){c.status ? ` · ${c.status}` : ""}
          </option>
        ))}
      </select>
      <button className="btn" onClick={confirm} disabled={busy}>
        <CircleCheck size={13} /> {busy ? "…" : "Confirm"}
      </button>
      {error && <span style={{ color: "var(--critical)", fontSize: 11.5 }}>{error}</span>}
    </span>
  );
}
