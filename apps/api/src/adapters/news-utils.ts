import type { NewsItem } from "@signal/core";

/** "Greggs plc" → "greggs": strip legal suffixes for querying and matching. */
export function coreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|inc|gmbh|co|company)\b\.?/g, "")
    .trim();
}

const POSITIVE =
  /\b(raises|funding|seed round|series [a-c]|expansion|expands|acquires|record profit|growth|new contract|wins|hiring|profit up|opens)\b/i;
const NEGATIVE =
  /\b(winding[- ]up|administration|liquidation|insolvency|lays off|layoffs|losses|probe|lawsuit|strike[- ]off|ccj|closes|shuts|bankrupt)\b/i;

export function classifySentiment(text: string): NewsItem["sentiment"] {
  if (NEGATIVE.test(text)) return "negative";
  if (POSITIVE.test(text)) return "positive";
  return "neutral";
}

/** Keep only articles that actually mention the company. */
export function relevantTo(companyName: string, items: NewsItem[]): NewsItem[] {
  const needle = coreName(companyName);
  if (!needle) return [];
  return items.filter((i) => `${i.title} ${i.summary ?? ""}`.toLowerCase().includes(needle));
}

/** Merge results from several sources: dedupe by URL + near-identical title, newest first. */
export function mergeNews(lists: NewsItem[][], cap = 10): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  const all = lists.flat().sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const item of all) {
    const urlKey = item.url.replace(/[?#].*$/, "");
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    if (seen.has(urlKey) || seen.has(titleKey)) continue;
    seen.add(urlKey);
    seen.add(titleKey);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/** Minimal XML entity decode for RSS text. */
export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/**
 * Generic RSS 2.0 <item> parser shared by the Google and Bing news adapters
 * (and anything else RSS-shaped). Regex-based on purpose — no XML dependency.
 */
export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  source?: string;
  description?: string;
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]!;
    const pick = (tag: string) => {
      const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return t ? decodeEntities(t[1]!.trim()) : "";
    };
    const title = pick("title");
    const link = pick("link");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate: pick("pubDate"),
      source: pick("source") || undefined,
      description: pick("description") || undefined,
    });
  }
  return items;
}

export function rssDate(pubDate: string): string {
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
