const baseUrl = normalizeBaseUrl(
  process.env.SIGNAL_LIVE_API_BASE_URL
    || process.env.API_BASE_URL
    || "https://signal-en-agent-ersgaojhti.ap-southeast-1.fcapp.run",
);

const timeoutMs = Number(process.env.SIGNAL_LIVE_CHECK_TIMEOUT_MS || 60000);
const failures = [];

console.log(`Signal live endpoint check: ${baseUrl}`);

const health = await requestJson("/health", { method: "GET" });
check(health.status === "ok", "Health endpoint must return status=ok.");
check(health.service === "signal-qwen-agent", "Health endpoint must identify the Signal Qwen agent service.");

const autopilot = await requestJson("/api/creative/autopilot", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    prompt: "Return a concise live Signal verification packet with evidence and human checkpoints.",
  }),
});

validateAgentPacket(autopilot, "autopilot");

const radar = await requestJson("/api/creative/radar", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    prompt: "Return a concise live radar verification packet with evidence and human checkpoints.",
  }),
});

validateAgentPacket(radar, "radar");

if (failures.length > 0) {
  console.log("");
  console.log("Failures");
  for (const failure of failures) {
    console.log(`FAIL ${failure}`);
  }
  process.exit(1);
}

console.log("");
console.log("Live Alibaba Cloud Qwen endpoint is responding with live agent packets.");
console.log(`Provider: ${autopilot.provider}`);
console.log(`Model: ${autopilot.model}`);
console.log(`Autopilot status: ${autopilot.status}`);
console.log(`Radar status: ${radar.status}`);

function validateAgentPacket(packet, label) {
  check(packet.mode === "live", `${label} response must report mode=live.`);
  check(packet.status === "pending_human_review", `${label} response must remain pending human review.`);
  check(packet.provider === "Alibaba Cloud Model Studio", `${label} response must come from Alibaba Cloud Model Studio.`);
  check(typeof packet.model === "string" && packet.model.startsWith("qwen"), `${label} response must identify a Qwen model.`);
  check(packet.result && typeof packet.result === "object", `${label} response must include a structured result object.`);
  check(typeof packet.result?.text === "string" && packet.result.text.length > 40, `${label} result must include substantive text.`);
  check(Array.isArray(packet.result?.evidence) && packet.result.evidence.length > 0, `${label} result must include evidence.`);
  check(
    Array.isArray(packet.result?.humanCheckpoints) && packet.result.humanCheckpoints.length > 0,
    `${label} result must include human checkpoints.`,
  );
  check(Array.isArray(packet.result?.nextActions) && packet.result.nextActions.length > 0, `${label} result must include next actions.`);
}

async function requestJson(path, init) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${raw.slice(0, 500)}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${url} returned non-JSON response: ${raw.slice(0, 500)}`);
  }
}

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function normalizeBaseUrl(value) {
  return String(value).trim().replace(/\/+$/, "");
}
