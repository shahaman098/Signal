import type { NewsItem, NewsPort } from "@signal/core";
import { classifySentiment, coreName, parseRssItems, relevantTo, rssDate } from "./news-utils.js";

/** Bing News RSS — second keyless source alongside Google News. */
export class BingNewsRssAdapter implements NewsPort {
  async searchCompanyNews(companyName: string): Promise<NewsItem[]> {
    const q = encodeURIComponent(`"${coreName(companyName)}"`);
    const url = `https://www.bing.com/news/search?q=${q}&format=rss`;
    try {
      const res = await fetch(url, { headers: { "user-agent": "signal-app/0.1" } });
      if (!res.ok) return [];
      const items: NewsItem[] = parseRssItems(await res.text())
        .map((r) => ({
          date: rssDate(r.pubDate),
          title: r.title,
          source: r.source ?? hostOf(r.link),
          url: r.link,
          sentiment: classifySentiment(`${r.title} ${r.description ?? ""}`),
          summary: r.description?.replace(/<[^>]+>/g, "").slice(0, 200),
        }))
        .filter((i) => i.date);
      return relevantTo(companyName, items).slice(0, 10);
    } catch {
      return [];
    }
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Bing News";
  }
}
