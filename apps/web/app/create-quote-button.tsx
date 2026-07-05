"use client";

import { useState } from "react";
import { api, type CreateQuoteResult, type ReactivationProposal } from "../lib/api";
import { ExternalLink, TrendUp } from "./icons";

/** Pushes a reactivation-offer quote to Xero and links to the created object. */
export function CreateQuoteButton({ proposal }: { proposal: ReactivationProposal }) {
  const [result, setResult] = useState<CreateQuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.createQuote(proposal.quote));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <span style={{ fontSize: 12.5 }}>
        ✓ Quote {result.quoteId.slice(0, 8)}…{" "}
        {result.deepLink && (
          <a href={result.deepLink} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> open in Xero
          </a>
        )}
      </span>
    );
  }

  return (
    <div>
      <button className="btn primary sm" onClick={onClick} disabled={loading}>
        <TrendUp size={13} /> {loading ? "Creating…" : "Quote in Xero"}
      </button>
      {error && <div style={{ color: "var(--critical)", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
