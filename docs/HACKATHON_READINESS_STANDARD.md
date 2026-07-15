# Hackathon Readiness Standard

Signal must not be described as `submission-ready` until the live Devpost minimum requirements are complete. Do not treat optional architecture upgrades as hard blockers.

Current status:

- Overall hackathon readiness: `NOT READY`
- Local implementation: `DONE`
- Alibaba Cloud Function Compute agent: `LIVE VERIFIED`
- Alibaba Cloud deployment proof: `LOCAL PROOF RECORDED`
- Public demo video: `NOT RECORDED`
- Public repository links: `NOT FILLED`

## Devpost Minimum Requirements

The live Global AI Hackathon Series with Qwen Cloud submission form requires:

1. Public code repository URL.
2. Open-source license visible in the repository.
3. Track selection.
4. Code file URL showing proof of Alibaba Cloud deployment.
5. Screenshot proof URL showing the project running on Alibaba Cloud.
6. Architecture diagram.
7. Public demo video URL.
8. Text description of the project.
9. Required eligibility and project metadata answers in Devpost.

For this project, the correct track is:

```text
Track 4: Autopilot Agent
```

## What Track 4 Requires From The Product

Signal should demonstrate that it:

- automates a real business workflow
- handles ambiguous operator input
- invokes external tools or backend services
- includes a human-in-the-loop checkpoint
- uses Qwen Cloud for model-backed reasoning
- avoids mock, fake, seeded, or fallback production data paths
- ensures no mock, fake, seeded, or fallback production data path exists

## What Has Been Properly Done

These parts are implemented and locally verified:

- Express API route: `POST /api/creative/autopilot`
- Express API route: `POST /api/creative/radar`
- Express API route: `GET /api/creative/overview`
- Autopilot packet with recommendation, evidence, Qwen-backed brief, checkpoints, and next actions
- Next.js Creative Radar UI with human review flow
- Runtime checks that reject fallback upstream output
- Runtime checks that reject localhost upstream configuration in production
- MCP server exposing `creative_overview`, `creative_radar`, and `creative_autopilot`
- Alibaba Cloud deployment manifests and Function/Container deployment helpers
- Alibaba Cloud Function Compute endpoint running `signal-qwen-agent` in `ap-southeast-1`
- Public Function Compute `/`, `/health`, `/api/creative/radar`, and `/api/creative/autopilot` verified on `2026-07-15`
- Devpost draft copy and demo script

Cloud proof recorded in:

- [docs/proof/function-compute-live-proof.md](./proof/function-compute-live-proof.md)
- [docs/proof/function-compute-console.jpg](./proof/function-compute-console.jpg)

Local implementation check:

```bash
npm run implementation:check
```

Passing that command means the local code and repo artifacts are valid. It does not mean the hackathon submission is complete.

## Required Before Submission

These items are required before the project can be called submission-ready:

1. Public GitHub repository URL is available.
2. Open-source license is visible on the repository page.
3. Code proof URL points to the Alibaba deployment file in the public repo.
4. Screenshot proof URL shows the backend/project running on Alibaba Cloud.
5. Public GitHub URL points to [docs/proof/function-compute-live-proof.md](./proof/function-compute-live-proof.md) or equivalent evidence.
6. Architecture URL points to the public architecture document or diagram.
7. Public demo video is recorded and uploaded.
8. Devpost text description is final.
9. [docs/HACKATHON_PROOF.md](./HACKATHON_PROOF.md) is filled for the required fields.
10. `npm run submission:check` passes.

## Optional Score Boosters

These are useful for judging, but they are not required by the live Devpost minimum:

- Model Studio Managed Agent created in the account
- Remote MCP service registered in Model Studio
- Verified managed-agent session ID
- Terraform deployment
- ACK or Kubernetes deployment
- ACR Enterprise Edition
- Remote MCP attachment proof

Use these only when they improve the demo without adding unnecessary cost or risk.

## The Only Acceptable Definition Of Ready

The project is ready to submit only when:

```bash
npm run submission:check
```

passes without failures.

That command checks the Devpost minimum, not the optional score boosters.
