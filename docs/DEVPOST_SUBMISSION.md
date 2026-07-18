# Devpost Submission Draft

This is draft copy. Do not submit it until [docs/HACKATHON_PROOF.md](./HACKATHON_PROOF.md) contains real public links and `npm run submission:check` passes.

## Ready-to-Paste Description

Signal is a self-auditing creative intelligence autopilot for growth teams that need to decide what ad creative to refresh, retire, or scale next. The product ingests live owned and competitor creative data from an upstream intelligence backend or Qwen web search, turns that data into fatigue and saturation signals, and uses Qwen-backed reasoning to generate a grounded strategy brief instead of a generic AI answer.

What makes Signal different is that it does not trust itself. Before any recommendation reaches a human, a second adversarial Qwen pass red-teams the packet: every cited source URL is fetched and verified against the live web, every factual claim is graded verified, unverified, or model-estimate, and the run ships with an auditor confidence score and explicit cautions. Agents hallucinate citations; Signal is built to catch its own. The packet then lands in an enforced approval gate: every run is registered in an append-only review ledger, approval is rejected unless the operator explicitly acknowledges each human checkpoint, and every decision is recorded with operator, note, and timestamp. That combination lets teams automate the slow evidence-gathering and first-pass analysis while keeping honest, accountable operator control at the decision boundary. Signal includes a live Alibaba Cloud Function Compute Qwen agent proof and is built around a real production workflow rather than a toy chat demo.

## Short Tagline

The autopilot that fact-checks itself before it asks for your signature: live evidence, adversarial Qwen self-audit, enforced human approval.

## Key Features

- Live owned and competitor creative overview
- Family weakness and pattern saturation analysis
- Grounded Qwen strategy brief generation
- Explicit `Autopilot Agent` run with evidence and recommended action type
- Adversarial self-audit: a second Qwen pass grades every claim and verifies every cited source URL against the live web
- Enforced human approval gate backed by an append-only review ledger with checkpoint acknowledgement
- Optional MCP tool service for direct Managed Agent attachment
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
- Append-only review ledger enforcing checkpoint acknowledgement before approval
- Timeout-controlled upstream calls
- Request tracing via `x-request-id`
- Separate optional MCP service for agent-facing tool access
- Alibaba Cloud deployment proof path
- Verified Function Compute endpoint returning Qwen `mode=live` agent packets
- Restricted egress policy

### Innovation and AI Creativity

- Self-auditing agent architecture: Qwen adversarially red-teams its own recommendation before a human sees it
- Live citation verification: every URL the model cites is fetched and its reachability shipped in the packet
- Claim-provenance grading (`verified` / `unverified` / `model_estimate`) turns hallucination risk into a visible, reviewable signal
- Converts ad-portfolio data into fatigue, pattern, and white-space signals
- Grounds Qwen output in structured meta signals from live creative data
- Separates automated analysis from an enforced, audited operator approval

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
- Demo Video URL: add the public YouTube, Vimeo, or Youku link from `docs/HACKATHON_PROOF.md` after upload.
- Proof File URL: `https://github.com/shahaman098/Signal/blob/main/deploy/alibaba-cloud/function-compute/standalone-agent.py`
- Architecture URL: `https://github.com/shahaman098/Signal/blob/main/ARCHITECTURE.md`

Use [docs/HACKATHON_READINESS_STANDARD.md](./HACKATHON_READINESS_STANDARD.md) and [docs/HACKATHON_PROOF.md](./HACKATHON_PROOF.md) as the final pre-submit gate.
