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
  "docs/HACKATHON_READINESS_STANDARD.md",
  "docs/HACKATHON_PROOF.md",
  "apps/api/src/routes/creative.routes.ts",
  "apps/api/src/services/creative-intelligence.service.ts",
  "deploy/alibaba-cloud/function-compute/bootstrap",
  "deploy/alibaba-cloud/function-compute/build-package.sh",
  "deploy/alibaba-cloud/function-compute/standalone-agent.py",
  "deploy/alibaba-cloud/function-compute/README.md",
  "docs/proof/function-compute-live-proof.md",
  "docs/proof/function-compute-console.jpg",
];

const failures = [];
const warnings = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function warn(condition, message) {
  if (!condition) {
    warnings.push(message);
  }
}

for (const file of requiredFiles) {
  check(existsSync(path.join(root, file)), `Missing required submission artifact: ${file}`);
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

const readme = readIfPresent("README.md");
check(readme.includes("Track 4: Autopilot Agent"), "README.md does not describe the hackathon track.");

const architecture = readIfPresent("ARCHITECTURE.md");
check(
  architecture.includes("POST /api/creative/autopilot"),
  "ARCHITECTURE.md does not document the autopilot route.",
);

const devpost = readIfPresent("docs/DEVPOST_SUBMISSION.md");
warn(
  !devpost.includes("REPLACE_WITH_"),
  "docs/DEVPOST_SUBMISSION.md still contains placeholder helper notes. Required final links are checked in docs/HACKATHON_PROOF.md.",
);

const envExample = readIfPresent(".env.example");
for (const variableName of ["CREATIVE_INTEL_API_BASE_URL", "CREATIVE_INTEL_BRAND_ID", "DASHSCOPE_API_KEY", "QWEN_MODEL"]) {
  check(envExample.includes(`${variableName}=`), `.env.example is missing ${variableName}`);
}

const proof = readIfPresent("docs/HACKATHON_PROOF.md");
for (const requiredEvidence of [
  "Public repo URL:",
  "Demo video URL:",
  "Architecture URL:",
  "Alibaba deployment code proof URL:",
  "Alibaba deployment screenshot proof URL:",
  "Track:",
  "Submission description status:",
  "License status:",
]) {
  check(proof.includes(requiredEvidence), `docs/HACKATHON_PROOF.md is missing evidence field: ${requiredEvidence}`);
}

for (const requiredAnswer of [
  "Submitter type:",
  "Country of residence:",
  "Project status:",
  "Project start date:",
  "Pre-May-26 update explanation:",
  "AI tools used:",
  "Learning level:",
  "Age of majority check:",
  "Eligible jurisdiction check:",
  "Sponsor employee check:",
]) {
  check(proof.includes(requiredAnswer), `docs/HACKATHON_PROOF.md is missing required Devpost answer field: ${requiredAnswer}`);
  check(
    isNonPlaceholderValue(readEvidenceValue(proof, requiredAnswer)),
    `${requiredAnswer} must be filled because Devpost requires it.`,
  );
}

const publicRepoUrl = readEvidenceValue(proof, "Public repo URL:");
check(isPublicHttpUrl(publicRepoUrl), "Public repo URL must be a real public http(s) URL, not a placeholder or localhost.");

const demoVideoUrl = readEvidenceValue(proof, "Demo video URL:");
check(isPublicHttpUrl(demoVideoUrl), "Demo video URL must be a real public http(s) URL, not a placeholder or localhost.");

const architectureUrl = readEvidenceValue(proof, "Architecture URL:");
check(isPublicHttpUrl(architectureUrl), "Architecture URL must be a real public http(s) URL, not a placeholder or localhost.");

const deploymentCodeProofUrl = readEvidenceValue(proof, "Alibaba deployment code proof URL:");
check(
  isPublicHttpUrl(deploymentCodeProofUrl),
  "Alibaba deployment code proof URL must be a real public http(s) URL, not a placeholder or localhost.",
);

const deploymentScreenshotProofUrl = readEvidenceValue(proof, "Alibaba deployment screenshot proof URL:");
check(
  isPublicHttpUrl(deploymentScreenshotProofUrl),
  "Alibaba deployment screenshot proof URL must be a real public http(s) URL, not a placeholder or localhost.",
);

const track = readEvidenceValue(proof, "Track:");
check(
  track === "Track 4: Autopilot Agent",
  "Track must be filled as Track 4: Autopilot Agent.",
);

const submissionDescriptionStatus = readEvidenceValue(proof, "Submission description status:");
check(
  isNonPlaceholderValue(submissionDescriptionStatus) && /ready|complete|final/i.test(submissionDescriptionStatus),
  "Submission description status must confirm the Devpost text description is ready.",
);

const licenseStatus = readEvidenceValue(proof, "License status:");
check(
  isNonPlaceholderValue(licenseStatus) && /visible|present|included/i.test(licenseStatus),
  "License status must confirm the open-source license is present and visible.",
);

warnOptionalUrl(proof, "Alibaba Cloud API base URL:");
warnOptionalUrl(proof, "Verified health URL:");
warnOptionalValue(proof, "Container image reference:");
warnOptionalValue(proof, "Model Studio workspace ID:");
warnOptionalValue(proof, "Managed Agent ID:");
warnOptionalValue(proof, "Remote MCP service URL or identifier:");
warnOptionalValue(proof, "Agent environment ID:");
warnOptionalValue(proof, "Verified session ID:");

console.log("Hackathon submission readiness check");
for (const file of requiredFiles) {
  if (existsSync(path.join(root, file))) {
    console.log(`PASS ${file}`);
  }
}

if (warnings.length > 0) {
  console.log("");
  console.log("Warnings");
  for (const warning of warnings) {
    console.log(`WARN ${warning}`);
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
console.log("Hackathon submission is ready. External cloud proof is present.");

function readIfPresent(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function readEvidenceValue(markdown, label) {
  const line = markdown
    .split("\n")
    .find((entry) => entry.trimStart().startsWith(`- ${label}`) || entry.trimStart().startsWith(`${label}`));
  if (!line) return "";
  const [, value = ""] = line.split(label);
  return value.trim().replace(/^`|`$/g, "");
}

function isNonPlaceholderValue(value) {
  return Boolean(value) && !/REPLACE_WITH_|TODO|TBD|OWNER_CONFIRMATION_REQUIRED|CONFIRMATION_REQUIRED/i.test(value);
}

function isPublicHttpUrl(value) {
  if (!isNonPlaceholderValue(value)) return false;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && !isLocalOrPrivateHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isRemoteServiceUrl(value) {
  return isPublicHttpUrl(value);
}

function isLocalOrPrivateHost(hostname) {
  const lowered = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1"].includes(lowered) || lowered.endsWith(".local")) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lowered)) {
    const [a, b] = lowered.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function warnOptionalUrl(markdown, label) {
  const value = readEvidenceValue(markdown, label);
  if (value && !/^optional/i.test(value) && !isPublicHttpUrl(value)) {
    warnings.push(`${label} is optional for Devpost minimum, but if filled it must be a public URL.`);
  }
}

function warnOptionalValue(markdown, label) {
  const value = readEvidenceValue(markdown, label);
  if (value && /REPLACE_WITH_|TODO|TBD/i.test(value)) {
    warnings.push(`${label} is optional for Devpost minimum and still contains a placeholder.`);
  }
}
