"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SourceItem } from "../../lib/api";
import { AlertOctagon, ExternalLink, FileText, Radar } from "../icons";

type TypeFilter = "all" | SourceItem["type"];

const TYPE_META: Record<SourceItem["type"], { label: string; icon: React.ReactNode; tint: string }> = {
  news: { label: "News", icon: <Radar size={14} />, tint: "var(--blue)" },
  gazette: { label: "Gazette", icon: <AlertOctagon size={14} />, tint: "var(--critical)" },
  filing: { label: "Filing", icon: <FileText size={14} />, tint: "var(--violet)" },
};

/** Client-side filterable evidence feed, grouped by day. */
export function SourcesFeed({ items }: { items: SourceItem[] }) {
  const [type, setType] = useState<TypeFilter>("all");
  const [negativeOnly, setNegativeOnly] = useState(false);

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (type === "all" || i.type === type) &&
          (!negativeOnly || i.sentiment === "negative" || i.type === "gazette"),
      ),
    [items, type, negativeOnly],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, SourceItem[]>();
    for (const item of filtered) {
      const day = item.date || "undated";
      const arr = map.get(day);
      if (arr) arr.push(item);
      else map.set(day, [item]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      {/* Filter row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {(["all", "news", "gazette", "filing"] as const).map((t) => (
          <button
            key={t}
            className={`btn sm${type === t ? " primary" : ""}`}
            onClick={() => setType(t)}
          >
            {t === "all" ? "All sources" : TYPE_META[t].label}
          </button>
        ))}
        <button
          className={`btn sm${negativeOnly ? " primary" : ""}`}
          onClick={() => setNegativeOnly(!negativeOnly)}
          style={{ marginLeft: "auto" }}
        >
          ⚠ Risk items only
        </button>
      </div>

      {filtered.length === 0 && (
        <div className="card">
          <p className="empty">
            No evidence gathered yet — run an ingestion from the Companies page, or connect
            live Companies House / news keys.
          </p>
        </div>
      )}

      {byDay.map(([day, dayItems]) => (
        <section key={day} style={{ marginBottom: 18 }}>
          <div className="overline">{formatDay(day)}</div>
          <div className="card" style={{ padding: "6px 20px" }}>
            <div className="row-list">
              {dayItems.map((item, i) => {
                const meta = TYPE_META[item.type];
                return (
                  <div className="row" key={`${item.url}-${i}`} style={{ alignItems: "flex-start" }}>
                    <span
                      style={{
                        color: meta.tint,
                        display: "inline-flex",
                        marginTop: 2,
                        flex: "none",
                      }}
                      title={meta.label}
                    >
                      {meta.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 550 }}>
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer">
                            {item.title} <ExternalLink size={11} />
                          </a>
                        ) : (
                          item.title
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>
                        {item.source}
                        {item.sentiment && item.type === "news" && (
                          <span
                            style={{
                              color:
                                item.sentiment === "negative"
                                  ? "var(--critical)"
                                  : item.sentiment === "positive"
                                    ? "var(--good-text)"
                                    : "var(--muted)",
                            }}
                          >
                            {" "}
                            · {item.sentiment}
                          </span>
                        )}
                        {" · "}
                        <Link href={`/companies/${encodeURIComponent(item.contactId)}`}>
                          {item.companyName} →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}

function formatDay(day: string): string {
  if (day === "undated") return "Undated";
  const d = new Date(day);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
