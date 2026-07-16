import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "README.md",
  "LICENSE",
  "ARCHITECTURE.md",
  "HACKATHON_COMPLETION_CHECKLIST.md",
  "docs/DEVPOST_SUBMISSION.md",
  "docs/DEMO_SCRIPT.md",
  "docs/ALIBABA_CLOUD_DEPLOYMENT.md",
  "docs/MODEL_STUDIO_MANAGED_AGENT.md",
  "docs/HACKATHON_READINESS_STANDARD.md",
  "docs/HACKATHON_PROOF.md",
  "apps/api/Dockerfile",
  "apps/api/policy.yaml",
  "apps/api/src/routes/creative.routes.ts",
  "apps/api/src/services/creative-intelligence.service.ts",
  "apps/mcp/Dockerfile",
  "apps/mcp/src/server.ts",
  "apps/mcp/src/http.ts",
  "apps/mcp/src/signal-mcp.ts",
  "deploy/alibaba-cloud/acs/signal-api.yaml",
  "deploy/alibaba-cloud/function-compute/bootstrap",
  "deploy/alibaba-cloud/function-compute/build-package.sh",
  "deploy/alibaba-cloud/function-compute/standalone-agent.py",
  "deploy/alibaba-cloud/function-compute/README.md",
  "deploy/alibaba-cloud/model-studio/signal-managed-agent.json",
  "deploy/alibaba-cloud/model-studio/push-mcp-image.sh",
  "deploy/alibaba-cloud/model-studio/signal-environment.json",
];

const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

for (const file of requiredFiles) {
  check(existsSync(path.join(root, file)), `Missing required implementation artifact: ${file}`);
}

const creativeRoutes = readIfPresent("apps/api/src/routes/creative.routes.ts");
check(
  creativeRoutes.includes('router.post("/autopilot"'),
  "Missing POST /api/creative/autopilot route in apps/api/src/routes/creative.routes.ts",
);

const creativeService = readIfPresent("apps/api/src/services/creative-intelligence.service.ts");
check(
  creativeService.includes("async autopilot("),
  "Missing autopilot service implementation in apps/api/src/services/creative-intelligence.service.ts",
);
check(
  creativeService.includes('if (radar.mode !== "live")'),
  "Creative intelligence service must reject non-live radar responses from the upstream backend.",
);
check(
  creativeService.includes("must point to a real remote backend in production"),
  "Creative intelligence service must reject localhost upstream configuration in production mode.",
);
check(
  creativeService.includes("/chat/completions") && creativeService.includes("DASHSCOPE_API_KEY"),
  "Creative intelligence service must call Qwen Model Studio directly when DASHSCOPE_API_KEY is configured.",
);
check(
  creativeService.includes("RADAR_RESULT_SCHEMA.parse"),
  "Creative intelligence service must validate Qwen radar JSON before returning it.",
);
check(
  !/CREATIVE_INTEL_DEMO_MODE|demoMode|demoOverview|demoRadar|demo-owned|demo-comp/i.test(creativeService),
  "Creative intelligence service must not include local demo mode or seeded creative data paths.",
);

const mcpServer = readIfPresent("apps/mcp/src/signal-mcp.ts");
for (const toolName of ["creative_overview", "creative_radar", "creative_autopilot"]) {
  check(
    mcpServer.includes(`"${toolName}"`) || mcpServer.includes(`'${toolName}'`),
    `Missing MCP tool registration for ${toolName} in apps/mcp/src/signal-mcp.ts`,
  );
}
check(
  mcpServer.includes("must point to a real remote Signal API in production"),
  "Signal MCP service must reject localhost SIGNAL_API_BASE_URL in production mode.",
);

const mcpHttpServer = readIfPresent("apps/mcp/src/http.ts");
for (const endpoint of ['"/mcp"', '"/sse"', '"/messages"', '"/health"']) {
  check(
    mcpHttpServer.includes(endpoint),
    `Missing remote MCP endpoint ${endpoint} in apps/mcp/src/http.ts`,
  );
}

const readme = readIfPresent("README.md");
check(readme.includes("Track 4: Autopilot Agent"), "README.md does not describe the hackathon track.");

const architecture = readIfPresent("ARCHITECTURE.md");
check(
  architecture.includes("POST /api/creative/autopilot"),
  "ARCHITECTURE.md does not document the autopilot route.",
);

const readiness = readIfPresent("docs/HACKATHON_READINESS_STANDARD.md");
check(
  readiness.includes("no mock, fake, seeded, or fallback production data path exists"),
  "docs/HACKATHON_READINESS_STANDARD.md must explicitly ban mock or fallback production data paths.",
);

const envExample = readIfPresent(".env.example");
for (const variableName of ["SIGNAL_API_BASE_URL", "DASHSCOPE_API_KEY", "WORKSPACE_ID", "QWEN_MODEL", "AGENTSTUDIO_URL"]) {
  check(envExample.includes(`${variableName}=`), `.env.example is missing ${variableName}`);
}
check(
  !envExample.includes("CREATIVE_INTEL_DEMO_MODE"),
  ".env.example must not expose a demo-data mode.",
);

const acsSecretTemplate = readIfPresent("deploy/alibaba-cloud/acs/signal-api-secret.example.yaml");
check(
  !/^(\s*)API_BASE_URL:/m.test(acsSecretTemplate),
  "signal-api-secret.example.yaml should not inject API_BASE_URL into the API runtime secret.",
);

const tfvarsExample = readIfPresent("deploy/alibaba-cloud/terraform/terraform.tfvars.example");
check(
  !tfvarsExample.includes(":latest"),
  "terraform.tfvars.example must not suggest a latest-tagged MCP container image.",
);

const fcBootstrap = readIfPresent("deploy/alibaba-cloud/function-compute/bootstrap");
check(
  fcBootstrap.includes("FC_SERVER_PORT") && fcBootstrap.includes("apps/api/dist/server.js"),
  "Function Compute bootstrap must start the built Signal API on the Function Compute port.",
);

const standaloneAgent = readIfPresent("deploy/alibaba-cloud/function-compute/standalone-agent.py");
check(
  standaloneAgent.includes("DASHSCOPE_API_KEY") && standaloneAgent.includes("/chat/completions"),
  "Standalone Function Compute agent must call Qwen Model Studio directly.",
);
check(
  standaloneAgent.includes("enable_search") && standaloneAgent.includes("forced_search"),
  "Standalone Function Compute agent must enable Qwen web search for live creative signals.",
);
check(
  !/mock[_-]?result|fake[_-]?result|fallback[_-]?result|demo[_-]?fixture/i.test(standaloneAgent),
  "Standalone Function Compute agent must not include mock, fake, demo-fixture, or fallback result paths.",
);

console.log("Local implementation artifact check");
for (const file of requiredFiles) {
  if (existsSync(path.join(root, file))) {
    console.log(`PASS ${file}`);
  }
}

if (failures.length > 0) {
  console.log("");
  console.log("Failures");
  for (const failure of failures) {
    console.log(`FAIL ${failure}`);
  }
  process.exit(1);
}

console.log("");
console.log("Local implementation is valid. Hackathon submission readiness still requires public Devpost links and required metadata.");

function readIfPresent(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}
