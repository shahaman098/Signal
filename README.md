# Signal — Xero Receivables Intelligence

Reads accounting data from **Xero (via MCP)**, derives payment/churn signals, and writes
quotes, draft invoices and payments back to Xero. Chase emails are drafted by Claude and
returned to the caller (they are *not* a Xero object).

```
┌─────────────┐     HTTP      ┌──────────────────────┐     XeroPort      ┌──────────────┐
│  apps/web   │ ────────────▶ │       apps/api       │ ───────────────▶  │  Xero (MCP)  │
│  Next.js    │   /api/...     │  Express + services  │   (adapter)       │  or Fake     │
│  dashboard  │ ◀──────────── │                      │ ◀───────────────  │              │
└─────────────┘                └──────────┬───────────┘                   └──────────────┘
                                          │ depends on
                                          ▼
                               ┌──────────────────────┐
                               │    packages/core     │  pure, framework-free
                               │  domain + analysis    │  (payment pattern, cadence,
                               │  + XeroPort interface │   slip-risk, recoverable, churn)
                               └──────────────────────┘
```

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | Framework-free domain model, Zod schemas, the `XeroPort` interface, and the **analysis layer** (pure functions). No Express, no Xero, no MCP — trivially unit-testable. |
| `apps/api` | Express server. Wires a `XeroPort` implementation into services + HTTP routes. |
| `apps/api/src/adapters` | `XeroMcpAdapter` (real Xero over MCP) and `FakeXeroAdapter` (deterministic in-memory data). |
| `apps/web` | Next.js dashboard consuming the API. |

The design is **ports-and-adapters**: `packages/core` defines the `XeroPort` boundary; the
API picks an adapter at boot (`XERO_ADAPTER=mcp|fake`). Everything above the port is unaware
of whether it's talking to real Xero or fixtures — which is exactly what makes the tests fast
and offline.

## What it does

**Reads (via MCP)** — invoices, contacts, payments, aged receivables (bank transactions /
P&L are optional `XeroPort` methods).

**Derives** (`packages/core/src/analysis`):
- `payment-pattern.ts` — per-customer avg days late + improving/worsening trend
- `order-cadence.ts` — frequency, recency, and new/repeat/lapsed/dormant segment
- `slip-risk.ts` — 0–1 risk score per overdue invoice, with reasons
- `recoverable.ts` — expected recoverable value (balance × recovery likelihood), ranked
- `churn.ts` — churn score combining declining orders + worsening payment + lapse

**Writes** (`apps/api`):
- `POST /api/actions/quotes` — reactivation / recurring-conversion offers (flagship)
- `POST /api/actions/invoices/draft` — draft invoices only, never auto-authorised
- `POST /api/actions/payments`
- `POST /api/actions/invoices/:id/chase-email` — Claude-drafted email (template fallback offline)
- `GET  /api/actions/reactivation-proposals` — auto-built offers for churn-risk customers

## Quick start

```bash
npm install
cp .env.example .env          # XERO_ADAPTER=fake works with zero credentials
npm test                      # 28 tests, fully offline

npm run dev:api               # API on :4000 (fake Xero data by default)
npm run dev:web               # dashboard on :3000
```

### Going live against Xero
Set in `.env`:
```
XERO_ADAPTER=mcp
XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...
ANTHROPIC_API_KEY=...         # enables Claude-written chase emails
```
The API launches the Xero MCP server (`@xeroapi/xero-mcp-server`) as a stdio subprocess.
The MCP tool names + payload mapping are isolated in `apps/api/src/adapters/xero-mcp.adapter.ts`
(`TOOLS` + the `map*` helpers) — the only place that needs touching if Xero's MCP surface shifts.

## Tests

```bash
npm test            # vitest run
npm run test:watch
npm run typecheck   # tsc -b across core + api
```

- `packages/core/src/analysis/analysis.test.ts` — 17 unit tests over the analysis layer,
  driven by a deterministic four-archetype fixture (`src/testing/demo-data.ts`).
- `apps/api/src/app.test.ts` — 11 supertest integration tests over the full HTTP surface,
  wired to the `FakeXeroAdapter`.

## Extending

- **New read**: add a method to `XeroPort`, implement in both adapters, surface via a route.
- **New derivation**: add a pure function under `packages/core/src/analysis`, fold it into
  `report.ts`, and add fixture-driven tests. It never needs to know about Xero or Express.
