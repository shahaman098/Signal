import type { GazetteNotice, GazettePort } from "@signal/core";
import { coreName, decodeEntities } from "./news-utils.js";

/**
 * The Gazette — the UK's official public record (keyless Atom feed). Insolvency
 * and strike-off notices appear here first; these are the "government files"
 * the Plan stage cites as evidence. Notices are name-filtered like news: only
 * kept when the title actually mentions the company.
 */
export class GazetteAdapter implements GazettePort {
  constructor(private readonly baseUrl = "https://www.thegazette.co.uk") {}

  async searchNotices(companyName: string): Promise<GazetteNotice[]> {
    const needle = coreName(companyName);
    if (!needle) return [];
    const url = `${this.baseUrl}/all-notices/notice/data.feed?text=${encodeURIComponent(`"${needle}"`)}&results-page-size=10`;
    try {
      const res = await fetch(url, { headers: { accept: "application/atom+xml", "user-agent": "signal-app/0.1" } });
      if (!res.ok) return [];
      const notices = parseGazetteFeed(await res.text());
      return notices.filter((n) => n.title.toLowerCase().includes(needle)).slice(0, 5);
    } catch {
      return [];
    }
  }
}

/** Parse the Gazette Atom feed's <entry> blocks (exported for tests). */
export function parseGazetteFeed(xml: string): GazetteNotice[] {
  const notices: GazetteNotice[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = m[1]!;
    const pick = (tag: string) => {
      const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return t ? decodeEntities(t[1]!.trim()) : "";
    };
    const linkMatch = block.match(/<link[^>]*href="([^"]+)"/);
    const title = pick("title");
    const published = pick("published") || pick("updated");
    if (!title || !linkMatch) continue;
    notices.push({
      date: published.slice(0, 10),
      title,
      url: linkMatch[1]!.startsWith("http") ? linkMatch[1]! : `https://www.thegazette.co.uk${linkMatch[1]}`,
      category: pick("category") || undefined,
    });
  }
  return notices;
}
