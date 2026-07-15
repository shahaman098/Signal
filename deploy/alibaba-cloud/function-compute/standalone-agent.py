#!/usr/bin/env python3
"""Single-file Function Compute web runtime for the Signal Qwen agent."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import urllib.error
import urllib.request


HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", os.getenv("FC_SERVER_PORT", "9000")))
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen-plus")


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
    return {
        "mode": "live",
        "status": "pending_human_review",
        "provider": "Alibaba Cloud Model Studio",
        "model": QWEN_MODEL,
        "goal": mission,
        "result": result,
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.respond_html(200, landing_page())
            return
        if self.path == "/health":
            self.respond(200, {"status": "ok", "service": "signal-qwen-agent"})
            return
        self.respond(404, {"error": "not_found"})

    def do_POST(self):
        if self.path not in {"/api/creative/autopilot", "/api/creative/radar"}:
            self.respond(404, {"error": "not_found"})
            return
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8") or "{}") if length else {}
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
        <p>Live creative autopilot for Celsius and energy drinks. The hosted endpoint calls Qwen Model Studio with web search enabled and returns an operator-reviewed agent packet. No demo fixture or fake fallback is served.</p>
        <div class="checks">
          <div class="check">Live mode response required</div>
          <div class="check">Human review checkpoint required</div>
          <div class="check">Provider must be Alibaba Cloud Model Studio</div>
        </div>
      </div>
      <div class="card">
        <label for="prompt" class="eyebrow">Run Agent</label>
        <textarea id="prompt">Produce a concise live creative autopilot brief for Celsius in energy drinks. Include current public competitor signals and one operator-reviewed next step.</textarea>
        <button id="run">Run Qwen Autopilot</button>
        <pre id="result">Click Run Qwen Autopilot to call /api/creative/autopilot.</pre>
      </div>
    </section>
  </main>
  <script>
    const button = document.getElementById("run");
    const result = document.getElementById("result");
    const prompt = document.getElementById("prompt");
    button.addEventListener("click", async () => {
      button.disabled = true;
      result.textContent = "Calling Qwen through Alibaba Cloud Model Studio...";
      try {
        const response = await fetch("/api/creative/autopilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: prompt.value })
        });
        const payload = await response.json();
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
