# Alibaba Cloud Deployment Proof

This repo supports a low-cost Alibaba Cloud proof path for the Signal API. The Devpost minimum is not Kubernetes, ACR Enterprise Edition, Terraform, or a Model Studio Managed Agent. The minimum is proof that the backend runs on Alibaba Cloud and a public repo link to the code that demonstrates that deployment path.

## Recommended Low-Cost Path

Use Function Compute first.

Relevant files:

- [deploy/alibaba-cloud/function-compute/standalone-agent.py](../deploy/alibaba-cloud/function-compute/standalone-agent.py) - deployed single-file Function Compute web runtime for the low-cost Qwen proof.
- [deploy/alibaba-cloud/function-compute/bootstrap](../deploy/alibaba-cloud/function-compute/bootstrap) - custom runtime startup file.
- [deploy/alibaba-cloud/function-compute/build-package.sh](../deploy/alibaba-cloud/function-compute/build-package.sh) - builds a zip package for upload.
- [deploy/alibaba-cloud/function-compute/README.md](../deploy/alibaba-cloud/function-compute/README.md) - console settings and verification flow.
- [apps/api/src/services/creative-intelligence.service.ts](../apps/api/src/services/creative-intelligence.service.ts) - live upstream proxy for creative data and Qwen-backed responses.

Build the package:

```bash
deploy/alibaba-cloud/function-compute/build-package.sh
```

Upload:

```text
dist/alibaba-function-compute/signal-api-fc.zip
```

Function Compute settings:

- Runtime: custom runtime or web function runtime that accepts a `bootstrap` startup file
- Startup file: `bootstrap`
- Listening port: `9000`
- HTTP trigger: enabled
- Region: `ap-southeast-1` unless the account requires another eligible region

Required runtime environment:

```bash
HOST=0.0.0.0
PORT=9000
DASHSCOPE_API_KEY=...
WORKSPACE_ID=...
QWEN_MODEL=qwen-plus
SIGNAL_TARGET_BRAND_NAME=Celsius
SIGNAL_TARGET_CATEGORY=energy drinks
```

Verify:

```bash
curl https://<function-compute-http-trigger>/health
curl -X POST https://<function-compute-http-trigger>/api/creative/autopilot \
  -H 'content-type: application/json' \
  --data '{}'
```

Expected response:

```json
{"status":"ok"}
```

The live Function Compute proof from `2026-07-15` is recorded in [docs/proof/function-compute-live-proof.md](./proof/function-compute-live-proof.md).

## Devpost Proof

Use these proof links:

- Deployment code proof: public URL to [deploy/alibaba-cloud/function-compute](../deploy/alibaba-cloud/function-compute)
- Screenshot proof: public screenshot showing the Function Compute service and/or the `/health` response

The screenshot proof should not be a localhost URL or a private IP.

## Optional Advanced Paths

These are still available for a stronger production story, but they are not required for the live Devpost minimum:

- [deploy/alibaba-cloud/acs/signal-api.yaml](../deploy/alibaba-cloud/acs/signal-api.yaml) - ACS/Kubernetes deployment manifest
- [deploy/alibaba-cloud/acs/deploy.sh](../deploy/alibaba-cloud/acs/deploy.sh) - container build and deploy helper
- [deploy/alibaba-cloud/terraform](../deploy/alibaba-cloud/terraform) - ACK, ACR EE, network, and optional MCP Function Compute resources
- [apps/mcp](../apps/mcp) - optional remote MCP service
- [docs/MODEL_STUDIO_MANAGED_AGENT.md](./MODEL_STUDIO_MANAGED_AGENT.md) - optional managed-agent path

Do not use ACR Enterprise Edition or ACK as the default path if cost is the priority.

## What Still Requires Account Access

This repo cannot by itself:

- capture a console screenshot
- record the public demo video

Those remaining steps require the signed-in Alibaba Cloud account and Devpost project access.
