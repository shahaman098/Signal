# Alibaba Function Compute Deployment

This is the low-cost Alibaba Cloud deployment path for the Signal API.

It avoids the expensive default path that requires ACR Enterprise Edition, ACK, LoadBalancer, and NAT. Use this path for the Devpost minimum unless there is a clear reason to use Kubernetes.

## Why This Path Exists

The live Devpost requirement is proof that the backend is running on Alibaba Cloud plus a link to code that demonstrates Alibaba Cloud service/API usage. It does not require ACR Enterprise Edition, ACK, Terraform, Model Studio Managed Agents, or remote MCP.

Alibaba Cloud Function Compute is a fully managed compute service for uploading and running code without managing servers. Alibaba's Function Compute docs also describe custom runtimes and web functions for HTTP-based applications.

## Files

- [bootstrap](./bootstrap) - Function Compute custom runtime entrypoint for the Express API.
- [build-package.sh](./build-package.sh) - builds the API and creates a zip package for Function Compute upload.
- [standalone-agent.py](./standalone-agent.py) - single-file Python web runtime used for the current low-cost live Qwen proof.
- [../acs/signal-api-secret.example.yaml](../acs/signal-api-secret.example.yaml) - documents the required runtime environment variables.

## Build The Package

```bash
deploy/alibaba-cloud/function-compute/build-package.sh
```

Output:

```text
dist/alibaba-function-compute/signal-api-fc.zip
```

## Function Compute Console Settings

Use these settings when creating the Function Compute web/custom runtime function:

- Runtime: custom runtime or web function runtime that accepts a `bootstrap` startup file
- Startup file: `bootstrap`
- Listening port: `9000`
- HTTP trigger: enabled
- Region: the same Alibaba region used for the hackathon proof, preferably `ap-southeast-1`

Required environment variables:

```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=9000
CREATIVE_INTEL_API_BASE_URL=https://...
CREATIVE_INTEL_BRAND_ID=...
CREATIVE_INTEL_BRAND_NAME=...
CREATIVE_INTEL_CATEGORY=...
CREATIVE_INTEL_TIMEOUT_MS=30000
DASHSCOPE_API_KEY=...
WORKSPACE_ID=...
QWEN_MODEL=qwen-plus
SIGNAL_TARGET_BRAND_NAME=Celsius
SIGNAL_TARGET_CATEGORY=energy drinks
```

If `QWEN_BASE_URL` is not set and `WORKSPACE_ID` is provided, the API uses the Singapore Model Studio endpoint:

```text
https://{WORKSPACE_ID}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
```

`CREATIVE_INTEL_API_BASE_URL` and `CREATIVE_INTEL_BRAND_ID` are optional in the low-cost hackathon path. When they are omitted, the deployed API uses Qwen web search to collect live public creative signals for `SIGNAL_TARGET_BRAND_NAME` and `SIGNAL_TARGET_CATEGORY`.

For the current verified low-cost proof, the console-deployed runtime is [standalone-agent.py](./standalone-agent.py) with:

- function name: `signal-qwen-agent`
- region: `ap-southeast-1`
- public endpoint: `https://signal-en-agent-ersgaojhti.ap-southeast-1.fcapp.run`
- hosted UI: `https://signal-en-agent-ersgaojhti.ap-southeast-1.fcapp.run/`
- startup command: `python3 app.py`
- listening port: `9000`

## Verification

After deployment, verify:

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

The autopilot response must include:

- `"mode":"live"`
- `"status":"pending_human_review"`
- `"provider":"Alibaba Cloud Model Studio"`
- `"model":"qwen-plus"`
- a `recommendation`
- `humanCheckpoints`

For Devpost, use this directory as the deployment code proof URL and add a screenshot or repo-hosted image showing the Function Compute function and/or `/health` response.

## Optional Paths

The Kubernetes, Terraform, ACR EE, and MCP paths remain in the repo for stronger production architecture, but they are optional and should not be used if they create unnecessary cost.
