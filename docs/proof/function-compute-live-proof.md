# Function Compute Live Proof

Verification date: `2026-07-15`

Alibaba Cloud region: `ap-southeast-1`

Function name: `signal-qwen-agent`

Public Function Compute endpoint:

```text
https://signal-en-agent-ersgaojhti.ap-southeast-1.fcapp.run
```

## Health Check

Command:

```bash
curl -i --max-time 30 https://signal-en-agent-ersgaojhti.ap-southeast-1.fcapp.run/health
```

Verified response:

```text
HTTP/1.1 200 OK
{"status": "ok", "service": "signal-qwen-agent"}
```

## Hosted Root UI Check

Command:

```bash
curl -sS --max-time 30 https://signal-en-agent-ersgaojhti.ap-southeast-1.fcapp.run/
```

Verified response:

```json
{
  "bytes": 5547,
  "hasTitle": true,
  "hasButton": true
}
```

The root page serves a hosted Signal Qwen Cloud Agent UI that calls `/api/creative/autopilot` from the same Function Compute endpoint.

## Qwen Autopilot Agent Check

Command:

```bash
curl -sS --max-time 120 \
  -X POST https://signal-en-agent-ersgaojhti.ap-southeast-1.fcapp.run/api/creative/autopilot \
  -H 'Content-Type: application/json' \
  --data '{"prompt":"Produce a concise live creative autopilot brief for Celsius in energy drinks. Include current public competitor signals and one operator-reviewed next step."}'
```

Verified response shape:

```json
{
  "status": "pending_human_review",
  "provider": "Alibaba Cloud Model Studio",
  "model": "qwen-plus",
  "mode": "live",
  "hasResult": true,
  "resultKeys": [
    "text",
    "thinking",
    "widget",
    "brief",
    "suggestions",
    "recommendation",
    "evidence",
    "humanCheckpoints",
    "nextActions"
  ]
}
```

## Qwen Radar Agent Check

Command:

```bash
curl -sS --max-time 120 \
  -X POST https://signal-en-agent-ersgaojhti.ap-southeast-1.fcapp.run/api/creative/radar \
  -H 'Content-Type: application/json' \
  --data '{"prompt":"Return a brief Qwen radar assessment for Celsius energy drinks with current public creative signals and no mock data."}'
```

Verified response shape:

```json
{
  "status": "pending_human_review",
  "provider": "Alibaba Cloud Model Studio",
  "model": "qwen-plus",
  "mode": "live",
  "hasResult": true,
  "resultKeys": [
    "text",
    "thinking",
    "widget",
    "brief",
    "suggestions",
    "recommendation",
    "evidence",
    "humanCheckpoints",
    "nextActions"
  ]
}
```

## Screenshot Proof

Local repo artifact:

```text
docs/proof/function-compute-console.jpg
```

Use the public GitHub URL to that image as the Devpost screenshot proof after the repository is pushed and public.
