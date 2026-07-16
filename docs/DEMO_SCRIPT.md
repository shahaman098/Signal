# Demo Script

This is a three-minute demo outline optimized for the Devpost judging criteria.

Record the current demo video locally with:

```bash
npm run demo:record
```

The generated MP4 is written to `output/demo/signal-qwen-demo.mp4`. Upload that file publicly to YouTube, Vimeo, or Facebook Video before running `npm run submission:check`.

## 0:00 to 0:20 - Problem

Open with the business pain:

"Creative teams waste time manually checking what ads are fatiguing, what competitors are repeating, and what to brief next. Signal automates that analysis and gives the operator a grounded Qwen brief instead of a blank page."

## 0:20 to 1:00 - Live Overview

Show the Creative Radar page.

Point out:

- owned creative count
- fatiguing or declining count
- family weak spots
- pattern map

Explain that the data is coming from a live upstream backend, not seeded demo JSON.

## 1:00 to 1:50 - Qwen Brief

Run one of the built-in prompts or type a new one:

- "What creative territory should we test next?"

Show the returned brief:

- summary
- metrics
- alerts
- strategy steps

State that the API rebuilds the latest overview first, then grounds the Qwen prompt in the live portfolio signals before asking for a brief.

## 1:50 to 2:20 - Human Checkpoint

Show the operator approval gate.

Explain:

- the brief is not auto-shipped
- an operator must confirm brand fit, platform fit, and novelty
- this is the human-in-the-loop checkpoint required for production workflows

Optionally copy the handoff note to show how the approved brief is packaged for the creative team.

## 2:20 to 2:45 - Engineering and Cloud Proof

Show the repo files:

- `apps/api/src/services/creative-intelligence.service.ts`
- `apps/api/Dockerfile`
- `deploy/alibaba-cloud/acs/signal-api.yaml`
- `apps/api/policy.yaml`

Explain:

- live upstream proxy
- typed validation
- Dockerized backend
- Alibaba Cloud deployment path

## 2:45 to 3:00 - Close

Close with:

"Signal is an autopilot for creative refresh planning: it gathers live evidence, uses Qwen to draft strategy, and keeps a human operator in control at the final decision point."
