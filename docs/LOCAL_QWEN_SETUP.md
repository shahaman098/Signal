# Local Qwen Setup

This file documents how to configure a local checkout for live Qwen Model Studio runs without committing secrets.

## API Key Source

Use Alibaba Cloud Model Studio in the Singapore region:

```text
https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=model#/api-key
```

Create a dedicated API key for local development. New Model Studio API keys are shown only once after creation, so copy the value immediately and store it only in the local untracked `.env` file.

Do not commit the API key, paste it into docs, or include it in screenshots.

## Required Local Values

```bash
DASHSCOPE_API_KEY=...
WORKSPACE_ID=ws-sa6mvuhwolukydvg
QWEN_MODEL=qwen-plus
SIGNAL_TARGET_BRAND_NAME=Celsius
SIGNAL_TARGET_CATEGORY=energy drinks
```

Leave `QWEN_BASE_URL` blank unless a different Model Studio compatible endpoint is required. With `WORKSPACE_ID` set, the API derives:

```text
https://ws-sa6mvuhwolukydvg.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
```

Leave `CREATIVE_INTEL_API_BASE_URL` and `CREATIVE_INTEL_BRAND_ID` blank when using Qwen web search instead of a separate creative intelligence backend.

## Verification

Start the local API:

```bash
npm run dev:api
```

Then verify a local Qwen-backed autopilot run:

```bash
curl -fsS -X POST http://127.0.0.1:4000/api/creative/autopilot \
  -H 'content-type: application/json' \
  --data '{"prompt":"Verify local Qwen configuration for Signal."}'
```

A valid response includes:

```text
mode=live
status=pending_human_review
brief present
humanCheckpoints present
nextActions present
```

Use the deployed endpoint check separately:

```bash
npm run live:check
```
