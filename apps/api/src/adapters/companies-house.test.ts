import { describe, expect, it } from "vitest";
import { namesMatch } from "./companies-house.adapter.js";

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
});
