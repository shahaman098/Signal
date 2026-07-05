import type { NewsItem, NewsPort } from "@signal/core";
import { classifySentiment, coreName, relevantTo } from "./news-utils.js";

/**
 * NewsAPI.org adapter. Free tier: 100 requests/day and ~1 month of history —
 * so this runs as ONE source inside CompositeNewsAdapter alongside the keyless
 * Google News RSS + GDELT feeds; hitting the quota just drops it from the merge.
 */
export class NewsApiAdapter implements NewsPort {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://newsapi.org/v2",
  ) {}

  async searchCompanyNews(companyName: string, opts?: { sinceDays?: number }): Promise<NewsItem[]> {
    const since = new Date(Date.now() - (opts?.sinceDays ?? 28) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    // Search the core trading name ("Greggs", not "Greggs plc") — legal suffixes
    // rarely appear in headlines and an exact-phrase match would miss everything.
    const base =
      `${this.baseUrl}/everything?q="${encodeURIComponent(coreName(companyName))}"` +
      `&sortBy=publishedAt&pageSize=10&language=en`;
    try {
      let res = await fetch(`${base}&from=${since}`, { headers: { "X-Api-Key": this.apiKey } });
      if (res.status === 426) {
        // Plan window exceeded — retry without `from`, letting the plan default apply.
        res = await fetch(base, { headers: { "X-Api-Key": this.apiKey } });
      }
      if (!res.ok) return [];
      const body = (await res.json()) as {
        articles?: { publishedAt: string; title: string; url: string; source?: { name?: string }; description?: string }[];
      };
      const items: NewsItem[] = (body.articles ?? []).map((a) => ({
        date: a.publishedAt.slice(0, 10),
        title: a.title,
        source: a.source?.name ?? "unknown",
        url: a.url,
        sentiment: classifySentiment(`${a.title} ${a.description ?? ""}`),
        summary: a.description,
      }));
      return relevantTo(companyName, items);
    } catch {
      return [];
    }
  }
}
