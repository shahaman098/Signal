"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ImpactSummary } from "../lib/api";
import { Glyph } from "./money-home";

interface ChatMsg {
  role: "user" | "agent" | "typing";
  text: string;
  who?: string;
}

const CHIPS = [
  "What should I act on first, and why?",
  "Where can I grow fastest?",
  "Am I covered this week?",
];

/**
 * The AI chat, as an overlay. Every answer comes from POST /api/ask, which
 * grounds the model in the live computed data — signals, metrics, company
 * intelligence and the impact ledger.
 */
export function ChatOverlay({
  onClose,
  pipeline,
  asOf,
}: {
  onClose: () => void;
  pipeline: ImpactSummary;
  asOf: string;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      role: "agent",
      text:
        `Hi — right now there's £${Math.round(pipeline.stages.found).toLocaleString("en-GB")} found in your data, ` +
        `£${Math.round(pipeline.stages.inMotion).toLocaleString("en-GB")} in motion and ` +
        `£${Math.round(pipeline.stages.landed).toLocaleString("en-GB")} landed. ` +
        `Ask me anything about the analysis — why something is ranked where it is, who's at risk, where to grow.`,
    },
  ]);
  const [input, setInput] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Enter animation + focus
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    const t = setTimeout(() => inputRef.current?.focus(), 400);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  function close() {
    setOpen(false);
    setTimeout(onClose, 280);
  }

  async function ask(question: string) {
    if (!question.trim()) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: question }, { role: "typing", text: "" }]);
    try {
      const res = await api.ask(question);
      setMsgs((m) => [
        ...m.filter((x) => x.role !== "typing"),
        { role: "agent", text: res.answer, who: res.answeredBy === "gemini" ? undefined : "offline summary" },
      ]);
    } catch (e) {
      setMsgs((m) => [
        ...m.filter((x) => x.role !== "typing"),
        { role: "agent", text: e instanceof Error ? `Something went wrong: ${e.message}` : "Something went wrong." },
      ]);
    }
  }

  const asked = msgs.some((m) => m.role === "user");

  return (
    <div className="chat-ov" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`chat-panel ${open ? "open" : ""}`} role="dialog" aria-label="Chat with Signal">
        <div className="chat-head">
          <div className="chat-head-av"><Glyph size={16} /></div>
          <div>
            <div className="chat-head-name">Signal</div>
            <div className="chat-head-sub">Grounded in your Xero data · as of {asOf}</div>
          </div>
          <button className="chat-close" onClick={close}>×</button>
        </div>

        <div className="chat-thread" ref={threadRef}>
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div className="cmsg user" key={i}>
                <div className="cbubble">{m.text}</div>
              </div>
            ) : m.role === "typing" ? (
              <div className="cmsg" key={i}>
                <div className="cmsg-av"><Glyph size={13} /></div>
                <div className="cmsg-body">
                  <div className="ctyping"><span /><span /><span /></div>
                </div>
              </div>
            ) : (
              <div className="cmsg" key={i}>
                <div className="cmsg-av"><Glyph size={13} /></div>
                <div className="cmsg-body">
                  {m.who && <span className="cmsg-who">{m.who}</span>}
                  <div className="cmsg-text">{m.text}</div>
                </div>
              </div>
            ),
          )}
        </div>

        {!asked && (
          <div className="chat-chips">
            {CHIPS.map((c) => (
              <button className="chat-chip" key={c} onClick={() => void ask(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="chat-comp">
          <input
            ref={inputRef}
            className="chat-input"
            placeholder="Ask anything about your money…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void ask(input); }}
          />
          <button className="chat-send" onClick={() => void ask(input)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
