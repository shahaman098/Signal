"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ActionProposal, type ImpactSummary } from "../lib/api";
import { ChatOverlay } from "./chat-overlay";

/**
 * The money home: Found → In motion → Landed pipeline, the next best move,
 * the action stream, and the ask bar. Every number is live from the API;
 * every execute is a real write-back.
 */

type Tag = "recover" | "grow" | "protect";
type CardState = "found" | "motion" | "landed";

const TAG_META: Record<Tag, { label: string; c: string; bg: string }> = {
  recover: { label: "Get paid", c: "#C9391A", bg: "rgba(201,57,26,0.1)" },
  grow: { label: "Grow", c: "#3d8a2e", bg: "rgba(102,167,55,0.13)" },
  protect: { label: "Protect", c: "#C0791E", bg: "rgba(226,137,41,0.15)" },
};

function tagOf(p: ActionProposal): Tag {
  if (p.category === "cash-recovery") return "recover";
  if (p.category === "revenue-growth") return "grow";
  return "protect";
}

function stateOf(p: ActionProposal): CardState {
  if (p.status === "proposed") return "found";
  if (p.status === "executed") {
    // Acknowledge-only outcomes land immediately; writes are in motion until money moves.
    return p.result?.xeroId || p.result?.emailDraft ? "motion" : "landed";
  }
  return "found";
}

function verbOf(p: ActionProposal): string {
  switch (p.action.kind) {
    case "chase-email":
      return "Send chase";
    case "create-quote":
    case "convert-recurring":
      return "Create quote";
    case "defer-bill":
      return "Re-sequence";
    case "pay-bill-early":
      return "Pay early";
    default:
      return "Review";
  }
}

const gbp = (n: number) =>
  "£" + Math.round(n).toLocaleString("en-GB");
const gbpShort = (n: number) =>
  n >= 1000 ? "£" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k" : "£" + Math.round(n);

export function Glyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        className="ag-star"
        d="M12 4C12.4 9.6 14.4 11.6 20 12 14.4 12.4 12.4 14.4 12 20 11.6 14.4 9.6 12.4 4 12 9.6 11.6 11.6 9.6 12 4Z"
        fill="#fff"
      />
      <circle className="ag-spark" cx="18.6" cy="5.4" r="1.7" fill="#fff" />
    </svg>
  );
}

function ActionIcon({ p, size = 42 }: { p: ActionProposal; size?: number }) {
  const t = TAG_META[tagOf(p)];
  const kind = p.action.kind;
  const inner =
    kind === "chase-email" ? (
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
        <path d="M4 8l8 5.5L20 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    ) : kind === "create-quote" || kind === "convert-recurring" ? (
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <path d="M6 3.5h7l5 5v12H6z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M13 3.5V9h5" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      </svg>
    ) : kind === "defer-bill" || kind === "pay-bill-early" ? (
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    ) : (
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.9" />
      </svg>
    );
  return (
    <div className="aic" style={{ width: size, height: size, background: t.bg, color: t.c }}>
      {inner}
    </div>
  );
}

/** External evidence flag: distress/gazette/negative news → risk; good news → good. */
function extOf(p: ActionProposal): { tone: "risk" | "good"; chip: string; title: string; url?: string; source: string } | null {
  if (p.signalId.startsWith("distress-collection") || p.signalId.startsWith("supplier-distress")) {
    const ev = p.reasoning.evidence.find((e) => e.url);
    return {
      tone: "risk",
      chip: "Customer at risk",
      title: p.reasoning.signalReasoning[0] ?? "Registry distress markers on file",
      url: ev?.url,
      source: "Companies House / The Gazette",
    };
  }
  if (p.signalId.startsWith("good-news-upsell")) {
    const ev = p.reasoning.evidence.find((e) => e.url && e.label.startsWith("News"));
    return {
      tone: "good",
      chip: "Good timing",
      title: p.reasoning.signalReasoning[0] ?? "Positive news on this customer",
      url: ev?.url,
      source: ev?.label.replace(/^News \[[a-z]+\]: /, "") ?? "News",
    };
  }
  return null;
}

const sayOf = (p: ActionProposal) => p.reasoning.decisionReasoning || p.reasoning.signalReasoning.join(". ");
const subjectOf = (p: ActionProposal) => p.contactName ?? p.title.split(":")[0]!.split(" — ")[0]!;
const hot = (p: ActionProposal) => p.severity === "urgent" || p.signalId.startsWith("distress-collection");

export function MoneyHome({
  proposals: initial,
  impact: initialImpact,
  asOf,
}: {
  proposals: ActionProposal[];
  impact: ImpactSummary;
  asOf: string;
}) {
  const router = useRouter();
  const [proposals, setProposals] = useState(initial);
  const [impact, setImpact] = useState(initialImpact);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const visible = useMemo(
    () => proposals.filter((p) => p.status === "proposed" || p.status === "executed"),
    [proposals],
  );
  const found = visible.filter((p) => stateOf(p) === "found");
  const hero = found[0];
  const rest = [
    ...found.slice(1),
    ...visible.filter((p) => stateOf(p) !== "found"),
  ];
  const open = openId ? visible.find((p) => p.id === openId) : undefined;

  const total = Math.max(1, impact.stages.found + impact.stages.inMotion + impact.stages.landed);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  async function execute(p: ActionProposal) {
    setBusy(true);
    try {
      const updated = await api.approveProposal(p.id);
      setProposals((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
      setImpact(await api.impact());
      setOpenId(null);
      showToast(
        updated.status === "executed"
          ? `${verbOf(p)} — done and written back to Xero`
          : `Action ${updated.status}`,
      );
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home-wrap">
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 22 }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Your money</div>
        <div className="home-status" style={{ marginLeft: "auto" }}>
          <span style={{ display: "inline-flex", width: 20, height: 20, borderRadius: "50%", background: "linear-gradient(160deg,#bcbce5,#8a8bc7)", alignItems: "center", justifyContent: "center" }}>
            <Glyph size={12} />
          </span>
          Agent · data as of {asOf}
        </div>
      </div>

      {/* Pipeline */}
      <div className="pipe">
        <div className="pipe-title">Your money this week</div>
        <div className="pipe-flow">
          <div className="stage">
            <div className="stage-label"><span className="stage-dot" style={{ background: "#c9c9c2" }} />Found</div>
            <div className="stage-num">{gbp(impact.stages.found)}</div>
            <div className="stage-sub">{found.length ? `${found.length} opportunit${found.length === 1 ? "y" : "ies"} awaiting your tap` : "all opportunities actioned"}</div>
          </div>
          <div className="stage-arrow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div className="stage">
            <div className="stage-label"><span className="stage-dot" style={{ background: "#8a8bc7" }} />In motion</div>
            <div className="stage-num" style={{ color: "#6b6ba0" }}>{gbp(impact.stages.inMotion)}</div>
            <div className="stage-sub">{impact.actionsExecuted ? `${impact.actionsExecuted} action${impact.actionsExecuted === 1 ? "" : "s"} working for you` : "nothing pending"}</div>
          </div>
          <div className="stage-arrow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div className="stage">
            <div className="stage-label"><span className="stage-dot" style={{ background: "#3d8a2e" }} />Landed</div>
            <div className="stage-num" style={{ color: "#2f7d3f" }}>{gbp(impact.stages.landed)}</div>
            <div className="stage-sub">real money, verified in Xero</div>
          </div>
        </div>
        <div className="pipe-track">
          <div className="pipe-seg landed" style={{ width: `${(impact.stages.landed / total) * 100}%` }} />
          <div className="pipe-seg motion" style={{ width: `${(impact.stages.inMotion / total) * 100}%` }} />
        </div>
        <div className="pipe-note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#b0b0a6" strokeWidth="2" /><path d="M16 16l4 4" stroke="#b0b0a6" strokeWidth="2" strokeLinecap="round" /></svg>
          From your Xero invoices, payments &amp; bills, Companies House, The Gazette and financial news
        </div>
      </div>

      {/* Next best move */}
      <div className="next-l">Next best move</div>
      {hero ? (
        <div className="hero" onClick={() => setOpenId(hero.id)}>
          <div className="hero-top">
            <ActionIcon p={hero} />
            <div>
              <div className="hero-name">{subjectOf(hero)}</div>
              <div className="hero-detail">{hero.title}</div>
            </div>
            <div className="hero-fig">
              <b style={{ color: hero.impact ? TAG_META[tagOf(hero)].c : "#17170f" }}>
                {hero.impact ? gbpShort(hero.impact) : "—"}
              </b>
              <span>{hero.impact ? "to unlock" : "signal"}</span>
            </div>
          </div>
          <div className="hero-say">
            <div className="say-ic"><Glyph size={14} /></div>
            <div className="say-t">{sayOf(hero)}</div>
          </div>
          <div className="hero-foot">
            <span className="tagpill" style={{ background: TAG_META[tagOf(hero)].bg, color: TAG_META[tagOf(hero)].c }}>
              {TAG_META[tagOf(hero)].label}
            </span>
            {extOf(hero) && <span className={`flagpill ${extOf(hero)!.tone}`}>{extOf(hero)!.chip}</span>}
            {hero.verification && (
              <span className={`flagpill ${hero.verification.verdict === "confirmed" ? "good" : "risk"}`} title={hero.verification.note}>
                {hero.verification.verdict === "confirmed" ? "AI-verified" : "Check data"}
              </span>
            )}
            <button className={`hero-cta ${hot(hero) ? "hot" : ""}`} onClick={(e) => { e.stopPropagation(); setOpenId(hero.id); }}>
              {verbOf(hero)} →
            </button>
          </div>
        </div>
      ) : (
        <div className="hero" style={{ cursor: "default", textAlign: "center", color: "#a3a399", padding: 34 }}>
          Everything&apos;s in motion or landed — the next move surfaces when the data changes. Try Generate on the Plan page.
        </div>
      )}

      {/* Stream */}
      {rest.length > 0 && <div className="next-l" style={{ marginTop: 26 }}>Then</div>}
      {rest.map((p) => {
        const s = stateOf(p);
        const t = TAG_META[tagOf(p)];
        return (
          <div key={p.id} className={`srow ${s === "motion" ? "busy" : ""} ${s === "landed" ? "gone" : ""}`} onClick={() => setOpenId(p.id)}>
            <ActionIcon p={p} />
            <div className="sbody">
              <div className="sname">{subjectOf(p)}</div>
              <div className="sdetail">{p.title}</div>
            </div>
            <span className="tagpill" style={{ background: t.bg, color: t.c, flexShrink: 0 }}>{t.label}</span>
            <div className="sfig">
              <b style={{ color: p.impact && s === "found" ? t.c : "#17170f" }}>{p.impact ? gbpShort(p.impact) : "—"}</b>
              <span>{p.impact ? (s === "landed" ? "secured" : "to unlock") : "signal"}</span>
            </div>
            {s === "found" ? (
              <button className={`sact ${hot(p) ? "hot" : ""}`} onClick={(e) => { e.stopPropagation(); setOpenId(p.id); }}>
                {verbOf(p)} →
              </button>
            ) : s === "motion" ? (
              <div className="sstate motion"><span className="spin" /> In motion</div>
            ) : (
              <div className="sstate landed">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 13l5 5 11-13" stroke="#3d6b1f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Landed
              </div>
            )}
          </div>
        );
      })}

      {/* Ask bar → chat overlay */}
      <div className="ask" onClick={() => setChatOpen(true)}>
        <div className="ask-mark"><Glyph size={14} /></div>
        <input
          className="ask-input"
          placeholder="Ask Signal — why this order? where can I grow fastest?"
          onFocus={() => setChatOpen(true)}
          readOnly
        />
        <button className="ask-send" onClick={(e) => { e.stopPropagation(); setChatOpen(true); }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {/* Action modal */}
      {open && (
        <div className="m-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <div className="m-modal">
            <div className="m-head">
              <ActionIcon p={open} />
              <div>
                <div className="m-title">{subjectOf(open)}</div>
                <div className="m-detail">{open.title}</div>
              </div>
              <button className="m-close" onClick={() => setOpenId(null)}>×</button>
            </div>
            <div className="m-fig" style={{ color: open.impact ? TAG_META[tagOf(open)].c : "#17170f" }}>
              {open.impact ? gbp(open.impact) : "—"}
              <span>{open.impact ? "to unlock" : "signal"}</span>
            </div>
            <div className="agent-blk">
              <div className="agent-blk-ic"><Glyph size={15} /></div>
              <div>
                <div className="agent-blk-l">Why this, why now</div>
                <div className="agent-blk-t">
                  {sayOf(open)}
                  {open.reasoning.signalReasoning.length > 0 && (
                    <> {open.reasoning.signalReasoning[0]}.</>
                  )}
                </div>
              </div>
            </div>
            {extOf(open) && (
              <div className={`ext ${extOf(open)!.tone}`}>
                <span style={{ color: extOf(open)!.tone === "risk" ? "#b23018" : "#3d6b1f", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" /><path d="M12 8v5M12 16v.4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></svg>
                </span>
                <div>
                  <div className="ext-t">{extOf(open)!.chip}</div>
                  <div className="ext-x">{extOf(open)!.title}</div>
                  <div className="ext-s">
                    Source · {extOf(open)!.url ? <a href={extOf(open)!.url} target="_blank" rel="noreferrer">{extOf(open)!.source}</a> : extOf(open)!.source}
                  </div>
                </div>
              </div>
            )}
            <div className="plan-l">What will happen</div>
            <div>
              {open.steps.map((s, i) => (
                <div className="step" key={i}>
                  <div className="step-n">{i + 1}</div>
                  <div className="step-t">{s}</div>
                </div>
              ))}
            </div>
            {open.result?.emailDraft && (
              <>
                <div className="plan-l">Draft ready</div>
                <div className="draft" style={{ maxWidth: "none" }}>
                  <div className="draft-subject">{open.result.emailDraft.subject}</div>
                  <pre>{open.result.emailDraft.body}</pre>
                </div>
              </>
            )}
            <div className="m-actions">
              {stateOf(open) === "found" ? (
                <>
                  <button className={`exec ${hot(open) ? "hot" : ""}`} disabled={busy} onClick={() => execute(open)}>
                    {busy ? "Executing…" : `${verbOf(open)} →`}
                  </button>
                  <button className="m-cancel" onClick={() => setOpenId(null)}>Cancel</button>
                </>
              ) : (
                <button className="exec" style={{ background: "#f2f2ef", color: "#17170f", cursor: "default" }}>
                  {stateOf(open) === "motion" ? "In motion — working on it" : "Landed"}
                  {open.result?.deepLink && (
                    <a href={open.result.deepLink} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: "#6b6ba0" }} onClick={(e) => e.stopPropagation()}>
                      open in Xero ↗
                    </a>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toastbar show">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 13l5 5 11-13" stroke="#7fd39a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {toast}
        </div>
      )}

      {/* Chat overlay */}
      {chatOpen && <ChatOverlay onClose={() => setChatOpen(false)} pipeline={impact} asOf={asOf} />}
    </div>
  );
}
