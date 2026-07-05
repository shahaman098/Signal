import type { NewsItem, NewsPort } from "@signal/core";
import { classifySentiment, coreName, relevantTo } from "./news-utils.js";

/**
 * GDELT 2.0 DOC API — free, keyless global news index. Slower-moving than
 * Google News but adds trade press and international coverage.
 */
export class GdeltNewsAdapter implements NewsPort {
  async searchCompanyNews(companyName: string, opts?: { sinceDays?: number }): Promise<NewsItem[]> {
    const days = Math.min(opts?.sinceDays ?? 90, 90);
    const q = encodeURIComponent(`"${coreName(companyName)}"`);
    const url =
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}` +
      `&mode=artlist&format=json&maxrecords=15&timespan=${days}d&sourcelang=english`;
    try {
      const res = await fetch(url, { headers: { "user-agent": "signal-app/0.1" } });
      if (!res.ok) return [];
      const body = (await res.json()) as {
        articles?: { url: string; title: string; seendate: string; domain: string }[];
      };
      // GDELT sometimes ignores `timespan` and returns archive hits — enforce
      // the window client-side.
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const items: NewsItem[] = (body.articles ?? [])
        .filter((a) => a.title && a.url)
        .map((a) => ({
          // seendate: "20260702T070000Z"
          date: `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}`,
          title: a.title,
          source: a.domain,
          url: a.url,
          sentiment: classifySentiment(a.title),
        }))
        .filter((i) => i.date >= cutoff);
      return relevantTo(companyName, items).slice(0, 10);
    } catch {
      return [];
    }
  }
}
