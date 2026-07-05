import type { NewsItem, NewsPort } from "@signal/core";
import { classifySentiment, coreName, parseRssItems, relevantTo, rssDate } from "./news-utils.js";

/**
 * Google News RSS — keyless and generous, so news doesn't hinge on the
 * NewsAPI free-tier quota. UK-biased edition by default.
 */
export class GoogleNewsRssAdapter implements NewsPort {
  constructor(private readonly edition = { hl: "en-GB", gl: "GB", ceid: "GB:en" }) {}

  async searchCompanyNews(companyName: string): Promise<NewsItem[]> {
    const q = encodeURIComponent(`"${coreName(companyName)}"`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=${this.edition.hl}&gl=${this.edition.gl}&ceid=${encodeURIComponent(this.edition.ceid)}`;
    try {
      const res = await fetch(url, { headers: { "user-agent": "signal-app/0.1" } });
      if (!res.ok) return [];
      return relevantTo(companyName, parseGoogleNewsRss(await res.text())).slice(0, 10);
    } catch {
      return [];
    }
  }
}

/** Google-specific mapping over the shared RSS parser (exported for tests). */
export function parseGoogleNewsRss(xml: string): NewsItem[] {
  return parseRssItems(xml)
    .map((r) => {
      // Google formats titles as "Headline - Source"; strip the trailing source.
      const source = r.source || r.title.split(" - ").at(-1) || "Google News";
      const title = r.title.endsWith(` - ${source}`)
        ? r.title.slice(0, -(source.length + 3))
        : r.title;
      return {
        date: rssDate(r.pubDate),
        title,
        source,
        url: r.link,
        sentiment: classifySentiment(title),
      };
    })
    .filter((i) => i.date);
}
