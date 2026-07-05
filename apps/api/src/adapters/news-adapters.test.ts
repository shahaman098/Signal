import { describe, expect, it } from "vitest";
import type { NewsItem } from "@signal/core";
import { parseGoogleNewsRss } from "./google-news.adapter.js";
import { classifySentiment, coreName, mergeNews, relevantTo } from "./news-utils.js";
import { CompositeNewsAdapter } from "./composite-news.adapter.js";

const RSS = `<?xml version="1.0"?><rss><channel>
<item>
  <title>Greggs opens 50 new stores in expansion push - BBC News</title>
  <link>https://news.google.com/rss/articles/abc123</link>
  <pubDate>Wed, 01 Jul 2026 07:00:00 GMT</pubDate>
  <source url="https://www.bbc.co.uk">BBC News</source>
</item>
<item>
  <title>Bakery chain faces winding-up petition - The Times</title>
  <link>https://news.google.com/rss/articles/def456</link>
  <pubDate>Tue, 30 Jun 2026 09:30:00 GMT</pubDate>
  <source url="https://www.thetimes.co.uk">The Times</source>
</item>
</channel></rss>`;

describe("news utils", () => {
  it("strips legal suffixes for querying", () => {
    expect(coreName("Greggs plc")).toBe("greggs");
    expect(coreName("Hamilton Smith Ltd.")).toBe("hamilton smith");
  });

  it("classifies sentiment from keywords", () => {
    expect(classifySentiment("Acme raises £2m seed round")).toBe("positive");
    expect(classifySentiment("Acme faces winding-up petition")).toBe("negative");
    expect(classifySentiment("Acme announces quarterly results")).toBe("neutral");
  });

  it("filters to articles that mention the company", () => {
    const items: NewsItem[] = [
      { date: "2026-07-01", title: "Greggs expands", source: "x", url: "https://a", sentiment: "positive" },
      { date: "2026-07-01", title: "Unrelated flood story", source: "y", url: "https://b", sentiment: "neutral" },
    ];
    expect(relevantTo("Greggs plc", items)).toHaveLength(1);
  });

  it("merges sources, deduping by url and near-identical title, newest first", () => {
    const a: NewsItem[] = [
      { date: "2026-07-01", title: "Greggs opens 50 new stores", source: "BBC", url: "https://bbc/x?utm=1", sentiment: "positive" },
    ];
    const b: NewsItem[] = [
      { date: "2026-07-01", title: "Greggs opens 50 new stores", source: "MSN", url: "https://msn/mirror", sentiment: "positive" },
      { date: "2026-06-20", title: "Older piece", source: "FT", url: "https://ft/z", sentiment: "neutral" },
    ];
    const merged = mergeNews([a, b]);
    expect(merged).toHaveLength(2); // title-dupe collapsed
    expect(merged[0]!.date).toBe("2026-07-01");
  });
});

describe("Google News RSS parsing", () => {
  it("parses items, stripping the trailing source from titles", () => {
    const items = parseGoogleNewsRss(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      date: "2026-07-01",
      title: "Greggs opens 50 new stores in expansion push",
      source: "BBC News",
      sentiment: "positive",
    });
    expect(items[1]!.sentiment).toBe("negative");
  });
});

describe("CompositeNewsAdapter", () => {
  it("survives a failing source and merges the rest", async () => {
    const good = {
      searchCompanyNews: async (): Promise<NewsItem[]> => [
        { date: "2026-07-01", title: "Acme wins new contract", source: "a", url: "https://a", sentiment: "positive" },
      ],
    };
    const bad = {
      searchCompanyNews: async (): Promise<NewsItem[]> => {
        throw new Error("rate limited");
      },
    };
    const composite = new CompositeNewsAdapter([good, bad]);
    const items = await composite.searchCompanyNews("Acme Ltd");
    expect(items).toHaveLength(1);
  });
});
