#!/usr/bin/env python3
"""Single-file Function Compute web runtime for the Signal Qwen agent."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import threading
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone


HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", os.getenv("FC_SERVER_PORT", "9000")))
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen-plus")

SOURCE_CHECK_TIMEOUT_S = 6
MAX_SOURCE_CHECKS = 5

# Human-review ledger for this instance: every run stays pending until an
# operator posts an explicit decision with acknowledged checkpoints.
RUNS = {}
RUNS_LOCK = threading.Lock()


def qwen_base_url() -> str:
    explicit = os.getenv("QWEN_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    workspace_id = os.getenv("WORKSPACE_ID", "").strip()
    if workspace_id:
        return f"https://{workspace_id}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
    return "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"


def qwen_chat(messages):
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is not configured")

    payload = {
        "model": QWEN_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "enable_search": True,
        "search_options": {"forced_search": True, "search_strategy": "turbo"},
        "messages": messages,
    }
    request = urllib.request.Request(
        f"{qwen_base_url()}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Qwen returned HTTP {exc.code}: {detail}") from exc

    content = body["choices"][0]["message"]["content"].strip()
    if content.startswith("```json"):
        content = content[len("```json"):]
    if content.startswith("```"):
        content = content[len("```"):]
    if content.endswith("```"):
        content = content[:-len("```")]
    return json.loads(content.strip())


def extract_urls(text):
    matches = re.findall(r"https?://[^\s\"'<>\)\]\}]+", text)
    cleaned = []
    for url in matches:
        url = url.rstrip(".,;:")
        if url not in cleaned:
            cleaned.append(url)
    return cleaned[:MAX_SOURCE_CHECKS]


def verify_sources(urls):
    checks = []
    for url in urls:
        status = None
        reachable = False
        for method in ("HEAD", "GET"):
            request = urllib.request.Request(url, method=method)
            try:
                with urllib.request.urlopen(request, timeout=SOURCE_CHECK_TIMEOUT_S) as response:
                    status = response.status
                    reachable = response.status < 400
                break
            except urllib.error.HTTPError as exc:
                status = exc.code
                if exc.code in (405, 501) and method == "HEAD":
                    continue
                reachable = exc.code < 400
                break
            except Exception:
                status = None
                reachable = False
                break
        checks.append({"url": url, "reachable": reachable, "httpStatus": status})
    return checks


def audit_packet(result, sources):
    """Adversarial second pass: grade every claim before the operator sees it."""
    try:
        audit = qwen_chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are Signal's adversarial evidence auditor. Another agent produced the attached creative "
                        "recommendation packet; your only job is to find its weaknesses before a human operator reviews it. "
                        "Grade each distinct factual claim: 'verified' only when a reachable cited source or your own web "
                        "search confirms it, 'unverified' when a citation cannot be confirmed, 'model_estimate' when it is "
                        "a plausible model-derived figure with no source. Named studies, surveys, sample sizes, and "
                        "market-share figures without a reachable source URL must never be graded 'verified'. Return strict "
                        'JSON only: {"confidence":0.0,"verdict":"evidence_verified|operator_caution",'
                        '"claims":[{"claim":"...","grade":"verified|unverified|model_estimate","note":"..."}],'
                        '"cautions":["..."]}. Use operator_caution whenever any claim is unverified or the '
                        "recommendation depends mostly on model estimates."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({"packet": result, "sourceChecks": sources}),
                },
            ]
        )
        verdict = audit.get("verdict")
        if verdict not in ("evidence_verified", "operator_caution"):
            raise RuntimeError(f"auditor returned invalid verdict: {verdict!r}")
        return {
            "verdict": verdict,
            "confidence": float(audit.get("confidence", 0)),
            "auditModel": QWEN_MODEL,
            "claims": audit.get("claims", []),
            "sources": sources,
            "cautions": audit.get("cautions", []),
        }
    except Exception as exc:
        return {
            "verdict": "audit_unavailable",
            "confidence": 0,
            "auditModel": QWEN_MODEL,
            "claims": [],
            "sources": sources,
            "cautions": [f"Adversarial audit pass failed, so treat every claim as unverified: {exc}"],
        }


def autopilot(prompt=None):
    brand = os.getenv("SIGNAL_TARGET_BRAND_NAME", "Celsius")
    category = os.getenv("SIGNAL_TARGET_CATEGORY", "energy drinks")
    mission = prompt or f"Find current public creative signals and recommend the next creative action for {brand}."
    result = qwen_chat(
        [
            {
                "role": "system",
                "content": (
                    "You are Signal's Qwen Cloud creative autopilot agent. Use web search for current public "
                    "owned and competitor creative/ad signals. Do not use examples, demo data, or invented facts. "
                    "Cite a full source URL for every named study, figure, or market fact; state anything without "
                    "a source URL as a model estimate, never as an established fact. "
                    "Return strict JSON with keys: text, thinking, widget, brief, suggestions, recommendation, "
                    "evidence, humanCheckpoints, nextActions."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "brand": brand,
                        "category": category,
                        "mission": mission,
                        "requiredStatus": "pending_human_review",
                    }
                ),
            },
        ]
    )

    sources = verify_sources(extract_urls(json.dumps(result)))
    trust = audit_packet(result, sources)

    run_id = str(uuid.uuid4())
    packet = {
        "runId": run_id,
        "mode": "live",
        "status": "pending_human_review",
        "provider": "Alibaba Cloud Model Studio",
        "model": QWEN_MODEL,
        "goal": mission,
        "result": result,
        "trust": trust,
    }
    with RUNS_LOCK:
        RUNS[run_id] = {
            "runId": run_id,
            "goal": mission,
            "trustVerdict": trust["verdict"],
            "trustConfidence": trust["confidence"],
            "status": "pending_human_review",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "decision": None,
        }
    return packet


DECISION_STATUS = {
    "approve": "approved",
    "reject": "rejected",
    "request_revision": "revision_requested",
}


def decide_run(run_id, body):
    action = body.get("action")
    operator = str(body.get("operator", "")).strip()
    if action not in DECISION_STATUS:
        return 400, {"error": "validation_error", "message": "action must be approve, reject, or request_revision"}
    if len(operator) < 2:
        return 400, {"error": "validation_error", "message": "operator name is required"}
    with RUNS_LOCK:
        record = RUNS.get(run_id)
        if record is None:
            return 404, {"error": "run_not_found", "message": f"No autopilot run is registered with id {run_id}."}
        if record["status"] != "pending_human_review":
            return 409, {
                "error": "review_state_conflict",
                "message": f"Run {run_id} was already decided as {record['status']}; the audit trail is append-only.",
            }
        if action == "approve" and body.get("acknowledgedCheckpoints") is not True:
            return 409, {
                "error": "review_state_conflict",
                "message": "Approval requires acknowledgedCheckpoints: true. Confirm every human checkpoint first.",
            }
        record["status"] = DECISION_STATUS[action]
        record["decision"] = {
            "action": action,
            "operator": operator,
            "note": str(body.get("note", "")).strip() or None,
            "acknowledgedCheckpoints": body.get("acknowledgedCheckpoints") is True,
            "decidedAt": datetime.now(timezone.utc).isoformat(),
        }
        return 200, dict(record)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.respond_html(200, landing_page())
            return
        if self.path == "/health":
            self.respond(200, {"status": "ok", "service": "signal-qwen-agent"})
            return
        if self.path == "/api/creative/runs":
            with RUNS_LOCK:
                runs = sorted(RUNS.values(), key=lambda record: record["createdAt"], reverse=True)
            self.respond(200, {"runs": runs})
            return
        self.respond(404, {"error": "not_found"})

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8") or "{}") if length else {}

        decision_match = re.fullmatch(r"/api/creative/runs/([0-9a-f-]+)/decision", self.path)
        if decision_match:
            status, payload = decide_run(decision_match.group(1), body)
            self.respond(status, payload)
            return

        if self.path not in {"/api/creative/autopilot", "/api/creative/radar"}:
            self.respond(404, {"error": "not_found"})
            return
        try:
            self.respond(200, autopilot(body.get("prompt")))
        except Exception as exc:
            self.respond(502, {"error": "qwen_agent_error", "message": str(exc)})

    def respond(self, status, payload):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def respond_html(self, status, body):
        raw = body.encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def landing_page():
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signal Qwen Cloud Agent</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #14120f;
      --muted: #665f55;
      --line: rgba(20, 18, 15, 0.16);
      --paper: #fffaf1;
      --accent: #ec5b2a;
      --accent-dark: #9d2f16;
      --mint: #8fd8c2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 20% 18%, rgba(236, 91, 42, 0.24), transparent 28rem),
        radial-gradient(circle at 86% 12%, rgba(143, 216, 194, 0.42), transparent 24rem),
        linear-gradient(135deg, #fff4da 0%, #f7e3c0 48%, #fffbf3 100%);
      min-height: 100vh;
    }
    main {
      width: min(1100px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 48px 0;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 420px;
      gap: 28px;
      align-items: stretch;
    }
    .card {
      border: 1px solid var(--line);
      background: rgba(255, 250, 241, 0.82);
      box-shadow: 0 24px 80px rgba(87, 54, 22, 0.18);
      border-radius: 28px;
      padding: 30px;
      backdrop-filter: blur(14px);
    }
    .eyebrow {
      display: inline-flex;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 7px 12px;
      color: var(--accent-dark);
      font: 700 12px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.52);
    }
    h1 {
      font-size: clamp(44px, 7vw, 86px);
      line-height: 0.88;
      letter-spacing: -0.07em;
      margin: 26px 0 18px;
      max-width: 760px;
    }
    p {
      color: var(--muted);
      font-size: 19px;
      line-height: 1.55;
      margin: 0;
    }
    .checks {
      display: grid;
      gap: 12px;
      margin-top: 30px;
      font: 700 14px/1.25 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .check {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 13px 14px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255,255,255,0.48);
    }
    textarea {
      width: 100%;
      min-height: 180px;
      resize: vertical;
      border-radius: 20px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.7);
      padding: 18px;
      color: var(--ink);
      font: 16px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    button {
      width: 100%;
      margin-top: 16px;
      border: 0;
      border-radius: 18px;
      background: var(--ink);
      color: white;
      padding: 17px 20px;
      font: 800 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
    }
    button:disabled { opacity: 0.58; cursor: wait; }
    .trust {
      margin-top: 16px;
      padding: 14px 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(143, 216, 194, 0.28);
      display: grid;
      gap: 6px;
      font: 600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .gate {
      margin-top: 12px;
      display: grid;
      gap: 10px;
    }
    .gate input[type="text"] {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      font: 14px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      background: rgba(255,255,255,0.7);
      color: var(--ink);
    }
    .ack { font: 600 13px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; display: flex; gap: 8px; align-items: center; }
    .gate-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .gate-button { margin-top: 0; }
    .gate-button-reject { background: var(--accent-dark); }
    .review-note { font: 600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--accent-dark); }
    pre {
      overflow: auto;
      white-space: pre-wrap;
      margin: 18px 0 0;
      padding: 18px;
      min-height: 220px;
      max-height: 460px;
      border-radius: 20px;
      border: 1px solid var(--line);
      background: #17130f;
      color: #fff1d7;
      font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    @media (max-width: 880px) {
      .hero { grid-template-columns: 1fr; }
      main { padding: 26px 0; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="card">
        <span class="eyebrow">Alibaba Cloud Function Compute + Qwen Model Studio</span>
        <h1>Signal Qwen Cloud Agent</h1>
        <p>Live self-auditing creative autopilot for Celsius and energy drinks. The hosted endpoint calls Qwen Model Studio with web search enabled, then a second adversarial Qwen pass fact-checks the packet and every cited source URL is verified against the live web before the run is queued for human approval. No demo fixture or fake fallback is served.</p>
        <div class="checks">
          <div class="check">Live mode response required</div>
          <div class="check">Adversarial self-audit with live source verification</div>
          <div class="check">Enforced human approval gate with audit trail</div>
          <div class="check">Provider must be Alibaba Cloud Model Studio</div>
        </div>
      </div>
      <div class="card">
        <label for="prompt" class="eyebrow">Run Agent</label>
        <textarea id="prompt">Produce a concise live creative autopilot brief for Celsius in energy drinks. Include current public competitor signals and one operator-reviewed next step.</textarea>
        <button id="run">Run Qwen Autopilot</button>
        <div id="trust" class="trust" hidden></div>
        <div id="gate" class="gate" hidden>
          <input id="operator" type="text" placeholder="Operator name" value="Judge">
          <label class="ack"><input id="ack" type="checkbox"> I reviewed every human checkpoint</label>
          <div class="gate-actions">
            <button id="approve" class="gate-button">Approve handoff</button>
            <button id="reject" class="gate-button gate-button-reject">Reject</button>
          </div>
          <div id="review" class="review-note"></div>
        </div>
        <pre id="result">Click Run Qwen Autopilot to call /api/creative/autopilot.</pre>
      </div>
    </section>
  </main>
  <script>
    const button = document.getElementById("run");
    const result = document.getElementById("result");
    const prompt = document.getElementById("prompt");
    const trust = document.getElementById("trust");
    const gate = document.getElementById("gate");
    const review = document.getElementById("review");
    let currentRunId = null;

    function renderTrust(packet) {
      const report = packet.trust;
      if (!report) return;
      const grades = { verified: 0, unverified: 0, model_estimate: 0 };
      for (const claim of report.claims || []) {
        if (claim.grade in grades) grades[claim.grade] += 1;
      }
      const liveSources = (report.sources || []).filter((s) => s.reachable).length;
      trust.hidden = false;
      trust.innerHTML =
        '<strong>Self-audit: ' + String(report.verdict).replaceAll("_", " ") + "</strong>" +
        "<span>Auditor confidence " + Math.round((report.confidence || 0) * 100) + "%" +
        " · " + grades.verified + " verified / " + grades.unverified + " unverified / " + grades.model_estimate + " model-estimate claims" +
        " · " + liveSources + "/" + (report.sources || []).length + " cited sources reachable</span>";
      gate.hidden = false;
      review.textContent = "";
    }

    async function decide(action) {
      if (!currentRunId) return;
      const body = {
        action,
        operator: document.getElementById("operator").value || "Judge",
        acknowledgedCheckpoints: document.getElementById("ack").checked,
      };
      const response = await fetch("/api/creative/runs/" + currentRunId + "/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      review.textContent = response.ok
        ? "Recorded: " + payload.status + " by " + payload.decision.operator + " at " + payload.decision.decidedAt
        : payload.message || payload.error;
    }

    document.getElementById("approve").addEventListener("click", () => decide("approve"));
    document.getElementById("reject").addEventListener("click", () => decide("reject"));

    button.addEventListener("click", async () => {
      button.disabled = true;
      trust.hidden = true;
      gate.hidden = true;
      result.textContent = "Calling Qwen through Alibaba Cloud Model Studio (agent run + adversarial audit)...";
      try {
        const response = await fetch("/api/creative/autopilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: prompt.value })
        });
        const payload = await response.json();
        currentRunId = payload.runId || null;
        renderTrust(payload);
        result.textContent = JSON.stringify(payload, null, 2);
      } catch (error) {
        result.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>"""


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
