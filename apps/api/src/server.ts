import type { CompanyIntelPort, NewsPort, XeroPort } from "@signal/core";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { FakeXeroAdapter } from "./adapters/fake-xero.adapter.js";
import { XeroMcpAdapter } from "./adapters/xero-mcp.adapter.js";
import {
  CompaniesHouseAdapter,
  CompaniesHouseStream,
} from "./adapters/companies-house.adapter.js";
import { NewsApiAdapter } from "./adapters/news.adapter.js";
import { FakeCompanyIntelAdapter, FakeNewsAdapter } from "./adapters/fake-intel.adapter.js";
import { ChaseEmailDrafter } from "./llm/chase-email.js";

type Config = ReturnType<typeof loadConfig>;

function buildXeroPort(config: Config): XeroPort {
  if (config.xeroAdapter === "mcp") {
    return new XeroMcpAdapter({
      command: config.xero.mcpCommand,
      args: config.xero.mcpArgs,
      clientId: config.xero.clientId,
      clientSecret: config.xero.clientSecret,
    });
  }
  return new FakeXeroAdapter();
}

function buildIntelPorts(config: Config): { intel: CompanyIntelPort; news: NewsPort } {
  const intel: CompanyIntelPort = config.companiesHouse.apiKey
    ? new CompaniesHouseAdapter(config.companiesHouse.apiKey)
    : new FakeCompanyIntelAdapter();
  const news: NewsPort = config.news.apiKey
    ? new NewsApiAdapter(config.news.apiKey)
    : new FakeNewsAdapter();
  return { intel, news };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const xero = buildXeroPort(config);
  const { intel, news } = buildIntelPorts(config);
  const emailDrafter = new ChaseEmailDrafter(config.anthropic.apiKey, config.anthropic.model);

  const { app, services } = createApp({
    xero,
    intel,
    news,
    emailDrafter,
    contextDir: config.contextDir,
    anthropicApiKey: config.anthropic.apiKey,
    claudeModel: config.anthropic.model,
  });

  // Prime the company-context files on boot so the agent has intelligence
  // available from the first request.
  services.ingestion
    .refreshAll()
    .then(({ updated }) => console.log(`[ingestion] refreshed ${updated} company contexts`))
    .catch((err) => console.error("[ingestion] initial refresh failed:", err));

  // Companies House real-time stream: registry changes for tracked companies
  // trigger an immediate re-ingest. Requires a dedicated STREAM key — CH issues
  // those separately from REST keys.
  if (config.companiesHouse.streamKey) {
    let tracked = new Set<string>();
    const refreshTracked = async () => {
      tracked = await services.ingestion.trackedCompanyNumbers();
    };
    await refreshTracked().catch(() => {});
    setInterval(() => void refreshTracked(), 10 * 60 * 1000).unref();

    const stream = new CompaniesHouseStream(
      config.companiesHouse.streamKey,
      () => tracked,
      (event) => {
        console.log(`[ch-stream] change event for ${event.companyNumber} — refreshing context`);
        services.ingestion.refreshAll().catch(() => {});
      },
      (msg) => console.log(msg),
    );
    stream.start();
  } else {
    // No stream key: fall back to slow polling so contexts don't go stale.
    setInterval(
      () => services.ingestion.refreshAll().catch(() => {}),
      12 * 60 * 60 * 1000,
    ).unref();
  }

  app.listen(config.port, () => {
    console.log(
      `[api] listening on :${config.port} (xero: ${config.xeroAdapter}, ` +
        `companies-house: ${config.companiesHouse.apiKey ? (config.companiesHouse.streamKey ? "rest+stream" : "rest, polling") : "fake"}, ` +
        `news: ${config.news.apiKey ? "newsapi" : "fake"})`,
    );
  });
}

void main();
