import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalyticsService } from "./analytics.service.js";
import { FakeXeroAdapter } from "../adapters/fake-xero.adapter.js";

describe("AnalyticsService resilience", () => {
  it("serves the last-known snapshot when a refresh fails (rate limit etc.)", async () => {
    const xero = new FakeXeroAdapter();
    let now = 1_000;
    const svc = new AnalyticsService(xero, 10, () => now);

    const first = await svc.getSnapshot();
    expect(first.contacts.length).toBeGreaterThan(0);

    // Expire the TTL, then make Xero fail like a 429.
    now += 100;
    xero.snapshot = async () => {
      throw new Error("Xero rate limit: retry tomorrow");
    };
    const second = await svc.getSnapshot();
    expect(second).toEqual(first); // stale but served
    expect(svc.staleSince).toBeTruthy();
  });

  it("recovers from disk cache across service restarts", async () => {
    const cachePath = join(mkdtempSync(join(tmpdir(), "signal-snap-")), "snap.json");
    const xero = new FakeXeroAdapter();
    const svc1 = new AnalyticsService(xero, 10, () => 1_000, cachePath);
    const original = await svc1.getSnapshot();
    // allow the fire-and-forget disk write to land
    await new Promise((r) => setTimeout(r, 50));

    // "Restart": new service whose Xero is down from the start.
    const deadXero = new FakeXeroAdapter();
    deadXero.snapshot = async () => {
      throw new Error("down");
    };
    const svc2 = new AnalyticsService(deadXero, 10, () => 2_000, cachePath);
    const restored = await svc2.getSnapshot();
    expect(restored.contacts.length).toBe(original.contacts.length);
    expect(svc2.staleSince).toBeTruthy();
  });

  it("still throws when there is no fallback at all", async () => {
    const deadXero = new FakeXeroAdapter();
    deadXero.snapshot = async () => {
      throw new Error("down");
    };
    const svc = new AnalyticsService(deadXero, 10);
    await expect(svc.getSnapshot()).rejects.toThrow("down");
  });
});
