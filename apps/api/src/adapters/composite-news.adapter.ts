import type { NewsItem, NewsPort } from "@signal/core";
import { mergeNews } from "./news-utils.js";

/**
 * Fans a company-news search out to several sources (Google News RSS, GDELT,
 * NewsAPI when a key exists), then merges: dedupe by URL/title, newest first.
 * A source failing (rate limit, outage) just drops out of the merge.
 */
export class CompositeNewsAdapter implements NewsPort {
  constructor(private readonly sources: NewsPort[]) {}

  async searchCompanyNews(companyName: string, opts?: { sinceDays?: number }): Promise<NewsItem[]> {
    const results = await Promise.allSettled(
      this.sources.map((s) => s.searchCompanyNews(companyName, opts)),
    );
    const lists = results
      .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === "fulfilled")
      .map((r) => r.value);
    return mergeNews(lists);
  }
}
