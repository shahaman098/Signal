import { createApp } from "./app.js";

async function main(): Promise<void> {
  const app = createApp();
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? "4000");

  app.listen(port, host, () => {
    console.log(`[api] listening on ${host}:${port}`);
  });
}

void main();
