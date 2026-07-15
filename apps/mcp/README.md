# Signal MCP Service

This workspace exposes Signal's creative endpoints as MCP tools:

- `creative_overview`
- `creative_radar`
- `creative_autopilot`

It now supports two deployment shapes:

- local stdio for direct local development
- remote HTTP transport for Alibaba Cloud Model Studio and Function Compute

The remote server exposes:

- `POST /mcp` for Streamable HTTP clients
- `GET /sse` and `POST /messages?sessionId=...` for SSE clients
- `GET /health` for load balancer and Function Compute health checks

## Local Development

```bash
npm run dev:mcp
```

Remote HTTP development:

```bash
npm run dev:mcp:http
```

Required environment variables:

```bash
SIGNAL_API_BASE_URL=http://127.0.0.1:4000
```

For cloud deployment, `SIGNAL_API_BASE_URL` must be the real remote Signal API URL. In `NODE_ENV=production`, the MCP service rejects `localhost`, `127.0.0.1`, and other local-only hostnames.

Start the Signal API first:

```bash
npm run dev:api
```

## Why This Exists

Model Studio Managed Agents attach MCP services as named tool bundles. This workspace is the tool bundle that matches the `signal-creative-tools` reference used by the Managed Agent spec in `deploy/alibaba-cloud/model-studio`.

For cloud deployment, use:

- [apps/mcp/Dockerfile](./Dockerfile)
- [push-mcp-image.sh](../../deploy/alibaba-cloud/model-studio/push-mcp-image.sh)
- [README.md](../../deploy/alibaba-cloud/terraform/README.md)
