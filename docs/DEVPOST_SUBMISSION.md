# Devpost Submission Draft

This is draft copy. Do not submit it until [docs/HACKATHON_PROOF.md](./HACKATHON_PROOF.md) contains real public links and `npm run submission:check` passes.

## Ready-to-Paste Description

Signal is a creative intelligence autopilot for growth teams that need to decide what ad creative to refresh, retire, or scale next. The product ingests live owned and competitor creative data from an upstream intelligence backend or Qwen web search, turns that data into fatigue and saturation signals, and uses Qwen-backed reasoning to generate a grounded strategy brief instead of a generic AI answer. The dashboard highlights weak creative families, open pattern territory, and competitor momentum, then routes the final brief through a human approval gate before handoff. That combination lets teams automate the slow evidence-gathering and first-pass analysis while keeping operators in control of brand and channel decisions. Signal includes a live Alibaba Cloud Function Compute Qwen agent proof and is built around a real production workflow rather than a toy chat demo.

## Short Tagline

Signal turns live ad intelligence into operator-approved Qwen briefs for faster creative refresh decisions.

## Key Features

- Live owned and competitor creative overview
- Family weakness and pattern saturation analysis
- Grounded Qwen strategy brief generation
- Explicit `Autopilot Agent` run with evidence and recommended action type
- Optional MCP tool service for direct Managed Agent attachment
- Human-in-the-loop approval gate
- Live Alibaba Cloud Function Compute proof endpoint for the Qwen agent

## Track

- Track 4: Autopilot Agent

## Why This Fits the Track

- Automates a real business workflow instead of a generic chat interaction
- Handles ambiguous prompts from operators
- Uses external live data and model-backed reasoning
- Produces a structured agent packet rather than only a free-form chat answer
- Includes a dedicated API agent surface, with optional MCP tools for deeper Model Studio integration
- Keeps a human checkpoint at the decision boundary

## Judging Map

### Technical Depth and Engineering

- Typed Express proxy with Zod validation
- Timeout-controlled upstream calls
- Request tracing via `x-request-id`
- Separate optional MCP service for agent-facing tool access
- Alibaba Cloud deployment proof path
- Verified Function Compute endpoint returning Qwen `mode=live` agent packets
- Restricted egress policy

### Innovation and AI Creativity

- Converts ad-portfolio data into fatigue, pattern, and white-space signals
- Grounds Qwen output in structured meta signals from live creative data
- Separates automated analysis from operator approval

### Problem Value and Impact

- Reduces time from creative review to next brief
- Gives growth teams a repeatable operating surface instead of ad hoc analysis
- Can scale to additional brands and categories by configuration

### Presentation and Documentation

- Clear README and architecture doc
- Alibaba Cloud deployment proof artifacts
- Three-minute demo script aligned to the product flow

## Submission Links To Fill In

- Repo URL: `https://github.com/shahaman098/Signal`
- Demo Video URL: `REPLACE_WITH_PUBLIC_VIDEO_URL`
- Proof File URL: `https://github.com/shahaman098/Signal/blob/main/deploy/alibaba-cloud/function-compute/standalone-agent.py`
- Architecture URL: `https://github.com/shahaman098/Signal/blob/main/ARCHITECTURE.md`

Use [docs/HACKATHON_READINESS_STANDARD.md](./HACKATHON_READINESS_STANDARD.md) and [docs/HACKATHON_PROOF.md](./HACKATHON_PROOF.md) as the final pre-submit gate.
