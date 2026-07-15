# Signal Hackathon Completion Checklist

This checklist reflects the live Devpost requirements for the **Global AI Hackathon Series with Qwen Cloud**.

## Deadline

- **July 20, 2026 at 10:00 PM GMT+1**

## Track

- **Track 4: Autopilot Agent**

## Current Honest Status

- Local implementation: `DONE`
- Hackathon submission: `NOT READY`
- Alibaba Cloud Function Compute agent: `LIVE VERIFIED`
- Alibaba Cloud deployment proof: `LOCAL PROOF RECORDED`
- Architecture doc: `DONE`
- Demo video: `NOT RECORDED`
- Public links: `NOT FILLED`

## Required Submission Items

### 1. Public open-source repository

Status:
- `Not complete until public GitHub URL is filled in docs/HACKATHON_PROOF.md`

Required:
- Make the repository public.
- Confirm [LICENSE](./LICENSE) is visible on the repository page.

### 2. Proof of Alibaba Cloud deployment

Status:
- `Backend is running on Alibaba Cloud; not complete until public proof links are filled`

Devpost requires:
- a URL to a code file in the repo showing Alibaba Cloud deployment/services/API usage
- a screenshot proof link showing the project running on Alibaba Cloud

Valid low-cost paths include:
- Function Compute with a Node.js package deployment
- Function Compute with the standalone Python Qwen agent in [deploy/alibaba-cloud/function-compute/standalone-agent.py](./deploy/alibaba-cloud/function-compute/standalone-agent.py)
- Function Compute with a container only if it avoids ACR Enterprise Edition
- another Alibaba Cloud backend service that produces clear proof

Not required by Devpost:
- ACR Enterprise Edition
- ACK or Kubernetes
- SLB or NAT
- Terraform

### 3. Architecture diagram

Status:
- `Complete`

Use:
- [ARCHITECTURE.md](./ARCHITECTURE.md)

### 4. Text description

Status:
- `Draft complete; final proof links still required`

Use:
- [docs/DEVPOST_SUBMISSION.md](./docs/DEVPOST_SUBMISSION.md)

### 5. Demo video

Status:
- `Not complete until public demo video URL is filled in docs/HACKATHON_PROOF.md`

Use:
- [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md)

Required:
- Record about a three-minute demo.
- Upload it publicly to YouTube, Vimeo, or Facebook Video.

### 6. Devpost custom answers

Status:
- `Not complete until docs/HACKATHON_PROOF.md is filled`

Required fields include:
- submitter type
- country of residence
- new or existing project
- project start date
- pre-May-26 update explanation
- selected track
- repo URL
- Alibaba deployment proof URL
- architecture file
- screenshot proof
- AI tools used
- learning level
- eligibility confirmations

## Optional Score Boosters

These can help judging but must not block a valid submission:

- Model Studio Managed Agent
- remote MCP service
- verified managed-agent session ID
- Terraform
- ACK/Kubernetes
- ACR Enterprise Edition

Use them only if they are working and affordable.

## Remaining Required Actions

1. Make the repo public.
2. Push the current Alibaba proof files to the public repo.
3. Fill [docs/HACKATHON_PROOF.md](./docs/HACKATHON_PROOF.md) with public proof links.
4. Record and publish the demo video.
5. Run `npm run submission:check`.
6. Submit under Track 4 with the required Devpost answers.

Rejected as not ready:

- local-only URLs such as `localhost` or private IPs in required proof fields
- placeholder required proof values
- fake, seeded, mock, or fallback production data paths
