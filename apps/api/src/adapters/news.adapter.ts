import type { NewsItem, NewsPort } from "@signal/core";

/**
 * Real news adapter (NewsAPI.org-compatible). Sentiment is a keyword heuristic;
 * swap in a classifier (or a Claude call) when precision matters. Any failure
 * degrades to "no news" rather than blocking ingestion.
 */
export class NewsApiAdapter implements NewsPort {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://newsapi.org/v2",
  ) {}

  async searchCompanyNews(companyName: string, opts?: { sinceDays?: number }): Promise<NewsItem[]> {
    const since = new Date(Date.now() - (opts?.sinceDays ?? 90) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    // Search the core trading name ("Greggs", not "Greggs plc") — legal suffixes
    // rarely appear in headlines and an exact-phrase match would miss everything.
    const needle = coreName(companyName);
    const base =
      `${this.baseUrl}/everything?q="${encodeURIComponent(needle)}"` +
      `&sortBy=publishedAt&pageSize=10&language=en`;
    try {
      let res = await fetch(`${base}&from=${since}`, { headers: { "X-Api-Key": this.apiKey } });
      if (res.status === 426) {
        // Free tier limits how far back `from` may reach — retry without it and
        // let the plan's default window apply.
        res = await fetch(base, { headers: { "X-Api-Key": this.apiKey } });
      }
      if (!res.ok) return [];
      const body = (await res.json()) as {
        articles?: { publishedAt: string; title: string; url: string; source?: { name?: string }; description?: string }[];
      };
      // NewsAPI matches loosely across fields — keep only articles that actually
      // mention the company in their title or description.
      return (body.articles ?? [])
        .filter((a) => `${a.title} ${a.description ?? ""}`.toLowerCase().includes(needle))
        .map((a) => ({
          date: a.publishedAt.slice(0, 10),
          title: a.title,
          source: a.source?.name ?? "unknown",
          url: a.url,
          sentiment: classify(`${a.title} ${a.description ?? ""}`),
          summary: a.description,
        }));
    } catch {
      return [];
    }
  }
}

/** "Greggs plc" → "greggs": strip legal suffixes for matching. */
function coreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|inc|gmbh|co|company)\b\.?/g, "")
    .trim();
}

const POSITIVE = /\b(raises|funding|seed round|series [a-c]|expansion|expands|acquires|record profit|growth|new contract|wins)\b/i;
const NEGATIVE = /\b(winding[- ]up|administration|liquidation|insolvency|lays off|layoffs|losses|probe|lawsuit|strike[- ]off|ccj)\b/i;

function classify(text: string): NewsItem["sentiment"] {
  if (NEGATIVE.test(text)) return "negative";
  if (POSITIVE.test(text)) return "positive";
  return "neutral";
}
