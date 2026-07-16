import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, "output", "demo");
const videoDir = path.join(outDir, "playwright-video");
const narrationPath = path.join(outDir, "narration.txt");
const audioPath = path.join(outDir, "narration.aiff");
const finalPath = path.join(outDir, "signal-qwen-demo.mp4");
const port = process.env.DEMO_PORT ? Number(process.env.DEMO_PORT) : await findAvailablePort(4177);
const appUrl = `http://127.0.0.1:${port}/creative`;

mkdirSync(videoDir, { recursive: true });
rmSync(videoDir, { recursive: true, force: true });
mkdirSync(videoDir, { recursive: true });

const narration = [
  "Signal is a creative intelligence autopilot for marketing teams that need faster decisions on what to refresh, retire, or scale.",
  "The dashboard starts from live evidence, not local fixtures. The local app is configured to reach the live Alibaba Cloud Qwen backend or a local Qwen key when the API server is running.",
  "The operator can ask an ambiguous creative question, then run the Autopilot Agent.",
  "Signal rebuilds the latest overview, grounds the prompt in public creative and competitor signals, and asks Qwen Model Studio for a structured brief.",
  "The response remains pending human review. The operator must confirm brand fit, platform fit, and novelty before any handoff.",
  "The implementation includes typed validation, runtime rejection of fallback data, an Alibaba Cloud Function Compute proof endpoint, and a separate MCP tool service.",
  "Signal demonstrates the Track Four Autopilot Agent pattern: a real business workflow, external tools, Qwen reasoning, and a human checkpoint at the decision boundary.",
].join(" ");

writeFileSync(narrationPath, `${narration}\n`);

const server = spawn("npm", ["run", "dev:web"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
  },
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
let serverExited = false;
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.on("exit", () => {
  serverExited = true;
});

try {
  await waitForApp(appUrl);
  await recordBrowserFlow();
  await buildFinalVideo();
  console.log(`Demo video written to ${finalPath}`);
} finally {
  stopServer(server);
}

async function waitForApp(url) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (serverExited) {
      throw new Error(`Demo web server exited before ${url} became available.\n${serverLog.slice(-2000)}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await pause(1000);
  }
  throw new Error(`Timed out waiting for ${url}\n${serverLog.slice(-2000)}`);
}

async function findAvailablePort(preferredPort) {
  if (await canBind(preferredPort)) {
    return preferredPort;
  }

  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() => {
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
        } else {
          reject(new Error("Could not allocate an available demo port."));
        }
      });
    });
  });
}

function canBind(candidatePort) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(candidatePort, () => {
      probe.close(() => resolve(true));
    });
  });
}

function stopServer(child) {
  if (!child.pid || serverExited) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function recordBrowserFlow() {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 40,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1440, height: 900 },
    },
    colorScheme: "light",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(3000);

  await page.screenshot({ path: path.join(outDir, "creative-dashboard.png"), fullPage: true });

  await smoothScroll(page, 500, 5);
  await page.waitForTimeout(1200);
  await smoothScroll(page, -260, 3);
  await page.waitForTimeout(1200);

  const prompt = page.locator("textarea.creative-textarea");
  if (await prompt.count()) {
    await prompt.fill("What creative territory should we test next, and what should stay behind a human approval gate?");
    await page.waitForTimeout(1200);
  }

  const agentButton = page.getByRole("button", { name: "Run Autopilot Agent" });
  if (await agentButton.count()) {
    await agentButton.click();
    await page.waitForTimeout(28000);
  }

  await smoothScroll(page, 720, 7);
  await page.waitForTimeout(1600);
  await smoothScroll(page, 720, 5);
  await page.waitForTimeout(1600);

  const checkboxes = page.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  for (let i = 0; i < Math.min(checkboxCount, 3); i += 1) {
    await checkboxes.nth(i).check({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
  }

  const approvalButton = page.getByRole("button", { name: "Approve for handoff" });
  if (await approvalButton.count()) {
    await approvalButton.click().catch(() => undefined);
    await page.waitForTimeout(1500);
  }

  await page.goto("https://github.com/shahaman098/Signal/blob/main/apps/api/src/services/creative-intelligence.service.ts", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3500);
  await page.mouse.wheel(0, 720);
  await page.waitForTimeout(1500);

  await page.goto("https://github.com/shahaman098/Signal/blob/main/deploy/alibaba-cloud/function-compute/standalone-agent.py", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3500);
  await page.mouse.wheel(0, 620);
  await page.waitForTimeout(1800);

  await context.close();
  await browser.close();
}

async function smoothScroll(page, distance, steps) {
  const delta = distance / steps;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(220);
  }
}

async function buildFinalVideo() {
  const webm = newestFile(videoDir, ".webm");
  if (!webm) {
    throw new Error("Playwright did not produce a WebM recording.");
  }

  const hasSay = await commandExists("say");
  const hasFfmpeg = await commandExists("ffmpeg");

  if (hasSay) {
    await run("say", ["-v", "Samantha", "-r", "158", "-o", audioPath, narration]);
  }

  if (!hasFfmpeg) {
    console.log(`ffmpeg is not available. Raw recording: ${webm}`);
    return;
  }

  if (existsSync(audioPath)) {
    await run("ffmpeg", [
      "-y",
      "-i", webm,
      "-i", audioPath,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-shortest",
      finalPath,
    ]);
  } else {
    await run("ffmpeg", [
      "-y",
      "-i", webm,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      finalPath,
    ]);
  }
}

function newestFile(dir, suffix) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(suffix))
    .map((file) => path.join(dir, file))
    .sort((left, right) => path.basename(right).localeCompare(path.basename(left)))[0] ?? null;
}

async function commandExists(command) {
  try {
    await run("which", [command], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: options.quiet ? "ignore" : "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}
