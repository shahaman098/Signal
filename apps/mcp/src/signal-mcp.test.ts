import { afterEach, describe, expect, it } from "vitest";
import { signalApiBaseUrl } from "./signal-mcp.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SIGNAL_API_BASE_URL = process.env.SIGNAL_API_BASE_URL;

describe("signalApiBaseUrl", () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_SIGNAL_API_BASE_URL === undefined) {
      delete process.env.SIGNAL_API_BASE_URL;
    } else {
      process.env.SIGNAL_API_BASE_URL = ORIGINAL_SIGNAL_API_BASE_URL;
    }
  });

  it("uses the local default in non-production mode", () => {
    delete process.env.NODE_ENV;
    delete process.env.SIGNAL_API_BASE_URL;
    expect(signalApiBaseUrl()).toBe("http://127.0.0.1:4000");
  });

  it("rejects localhost in production mode", () => {
    process.env.NODE_ENV = "production";
    process.env.SIGNAL_API_BASE_URL = "http://127.0.0.1:4000";
    expect(() => signalApiBaseUrl()).toThrow("real remote Signal API");
  });

  it("accepts a real remote URL in production mode", () => {
    process.env.NODE_ENV = "production";
    process.env.SIGNAL_API_BASE_URL = "https://signal-api.example.com/";
    expect(signalApiBaseUrl()).toBe("https://signal-api.example.com");
  });
});
