import { describe, expect, it } from "vitest";
import { namesMatch, probableMatch } from "./companies-house.adapter.js";
import { parseGazetteFeed } from "./gazette.adapter.js";

describe("Companies House name matching", () => {
  it("accepts legal-suffix and punctuation variants of the same name", () => {
    expect(namesMatch("Dana Retail Ltd", "DANA RETAIL LIMITED")).toBe(true);
    expect(namesMatch("Grow Fast Ltd", "GROW FAST LTD.")).toBe(true);
    expect(namesMatch("Greggs plc", "GREGGS PLC")).toBe(true);
    expect(namesMatch("Smith & Jones Limited", "SMITH  JONES LTD")).toBe(true);
  });

  it("rejects fuzzy search hits that are actually different companies", () => {
    expect(namesMatch("Reliable Rita Ltd", "AEER RITA CARE LTD")).toBe(false);
    expect(namesMatch("Grim Materials Ltd", "AAIMS GRIMSBYINVESTMENT1 LIMITED")).toBe(false);
    expect(namesMatch("Chronic Chris Co", "CHRONICLES CHRISTIAN CHARITY")).toBe(false);
  });

  it("probable tier: all name tokens contained in the registered title", () => {
    expect(probableMatch("Hamilton Smith Ltd", "HAMILTON SMITH CONSULTING LIMITED")).toBe(true);
    expect(probableMatch("Port & Philip Freight", "PORT AND PHILIP FREIGHT SERVICES LTD")).toBe(true);
    expect(probableMatch("Reliable Rita Ltd", "AEER RITA CARE LTD")).toBe(false);
    // Single-token names can never be "probable" — too easy to false-positive.
    expect(probableMatch("Greggs", "GREGGS FOUNDATION")).toBe(false);
  });
});

describe("Gazette feed parsing", () => {
  const ATOM = `<?xml version="1.0"?><feed>
  <entry>
    <id>https://www.thegazette.co.uk/id/12345</id>
    <title>Petitions to wind up (Companies) — ACME WIDGETS LTD</title>
    <published>2026-06-20T00:00:00Z</published>
    <category term="Corporate Insolvency"/>
    <link href="https://www.thegazette.co.uk/notice/12345"/>
  </entry>
  </feed>`;

  it("parses entries with title, date, url", () => {
    const notices = parseGazetteFeed(ATOM);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      date: "2026-06-20",
      title: "Petitions to wind up (Companies) — ACME WIDGETS LTD",
      url: "https://www.thegazette.co.uk/notice/12345",
    });
  });
});
