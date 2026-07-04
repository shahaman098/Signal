import type { XeroPort } from "@signal/core";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { FakeXeroAdapter } from "./adapters/fake-xero.adapter.js";
import { XeroMcpAdapter } from "./adapters/xero-mcp.adapter.js";
import { ChaseEmailDrafter } from "./llm/chase-email.js";

function buildXeroPort(config: ReturnType<typeof loadConfig>): XeroPort {
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

function main(): void {
  const config = loadConfig();
  const xero = buildXeroPort(config);
  const emailDrafter = new ChaseEmailDrafter(config.anthropic.apiKey, config.anthropic.model);
  const app = createApp({ xero, emailDrafter });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[api] listening on :${config.port} (xero adapter: ${config.xeroAdapter})`,
    );
  });
}

main();
