# Model Studio Managed Agent

This document tracks the optional managed-agent path for Signal on Alibaba Cloud Model Studio. It is intentionally strict about what is implemented, what is inferred, and what is still blocked.

## Why This Exists

The hackathon goal is to ship a Qwen-powered project that fits one of the tracks. For Track 4, the minimum requirement is a real business workflow with ambiguous inputs, external tool/backend usage, and human checkpoints. A Model Studio Managed Agent plus MCP attachment is a strong enhancement, but it is not required by the live Devpost minimum.

## What Is Implemented In The Repo

- [signal-managed-agent.json](../deploy/alibaba-cloud/model-studio/signal-managed-agent.json) - managed-agent draft spec
- [signal-environment.json](../deploy/alibaba-cloud/model-studio/signal-environment.json) - managed-agent environment draft spec
- [server.ts](../apps/mcp/src/server.ts) - Signal tool definitions
- [http.ts](../apps/mcp/src/http.ts) - remote MCP transport exposing `/mcp`, `/sse`, `/messages`, and `/health`
- [Dockerfile](../apps/mcp/Dockerfile) - remote MCP container packaging
- [push-mcp-image.sh](../deploy/alibaba-cloud/model-studio/push-mcp-image.sh) - helper for building and pushing the MCP image
- [create-agent.sh](../deploy/alibaba-cloud/model-studio/create-agent.sh) - direct API helper
- [create-environment.sh](../deploy/alibaba-cloud/model-studio/create-environment.sh) - direct API helper

## What We Verified In The Live Console

- The current account has access to Model Studio managed agents in the Singapore workspace.
- The live console route is `https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=managed-agents#/managed-agents/...`.
- The live workspace host is Singapore-based, not Beijing-based.
- Managed-agent creation in the console remains blocked until at least one MCP service or tool capability is activated and attachable.
- Direct `agentstudio` API calls that were previously assumed from older docs did not succeed against the live Singapore workspace host in our testing.

That means the repo should not claim that managed-agent creation is automated end to end yet.

## Region Guidance

The repo now defaults `mcp_region_id` to `ap-southeast-1` to match the live Model Studio workspace that is actually available in this account.

Do not hardcode `cn-beijing` in new deployment steps unless the console or current Alibaba docs for your account explicitly require it.

## Required Environment Variables

These are still the right inputs for the helper scripts, but the exact `AGENTSTUDIO_URL` must come from the live console or the current API quickstart for the active workspace:

```bash
export DASHSCOPE_API_KEY="sk-xxx"
export WORKSPACE_ID="ws_xxxxxxxxxxxx"
export AGENTSTUDIO_URL="https://${WORKSPACE_ID}.ap-southeast-1.maas.aliyuncs.com/api/v1/agentstudio"
```

Treat the URL format above as a template, not a verified guarantee.

## Optional End-to-End Flow

Use this only if it can be completed without unnecessary cost:

1. Deploy the Signal API on Alibaba Cloud.
2. Deploy the remote MCP host.
3. Register the Function Compute public URL in Model Studio as a custom MCP service.
4. Attach that MCP service to the managed agent.
5. Publish the agent and run a real task session.

## Current Remaining Blockers

These blockers affect only the optional managed-agent enhancement:

1. The custom MCP service is not yet registered in Model Studio.
2. The managed agent is not yet created in the live console.
3. No real managed-agent session has been executed yet.

## What This Means For Submission Readiness

The project can still be a valid Devpost submission without this managed-agent path if the required Devpost proof is complete.

Do not block final submission on:

- Terraform
- ACR Enterprise Edition
- ACK/Kubernetes
- remote MCP registration
- managed-agent session IDs

Do use managed-agent evidence if it is working, because it strengthens the technical-depth story.
