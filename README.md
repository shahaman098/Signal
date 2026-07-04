# Signal - Xero Intelligence

Reads accounting data from **Xero (via MCP)** and company intelligence from
**Companies House + financial news**, derives a full signal taxonomy, and lets an
**agent decide how to act** — writing quotes, draft invoices and payments back to Xero.
Chase emails are drafted by Claude and returned to the caller (they are *not* a Xero object).

```
┌─────────────┐  HTTP   ┌──────────────────────────┐  XeroPort          ┌──────────────┐
│  apps/web   │ ──────▶ │        apps/api          │ ─────────────────▶ │  Xero (MCP)  │
│  Next.js    │         │  Express + services      │  CompanyIntelPort  ├──────────────┤
│  dashboard  │ ◀────── │  ingestion · signals     │ ─────────────────▶ │ Companies    │
└─────────────┘         │  agent · actions         │  NewsPort          │ House + News │
                        └───────────┬──────────────┘ ─────────────────▶ └──────────────┘
                                    │ depends on              │
                                    ▼                         ▼
                        ┌──────────────────────┐   data/company-context/*.json
                        │    packages/core     │   one context file per company:
                        │  domain + analysis   │   CH data (filing PDFs linked),
                        │  + signal engine     │   news (source links), role
                        └──────────────────────┘
```

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | Framework-free domain model, Zod schemas, ports (`XeroPort`, `CompanyIntelPort`, `NewsPort`), the **analysis layer** and the **signal engine** — all pure functions. |
| `apps/api` | Express server: adapters, ingestion, signals, agent decisions, write actions. |
| `apps/api/src/adapters` | `XeroMcpAdapter` (Xero over MCP), `CompaniesHouseAdapter` (REST + **streaming**), `NewsApiAdapter`, plus deterministic fakes for all three. |
| `apps/web` | Next.js dashboard: KPIs, agent decisions, signals by category, chase-email drafting. |
| `data/company-context/` | One JSON file per company — the agent's full purchaser/supplier dossier. |

Ports-and-adapters throughout: every external system sits behind a port defined in
core, and each has a fake — the entire test suite (56 tests) runs offline.

## Data in

- **Xero (via MCP)** — invoices, contacts, payments, aged receivables, bills, suppliers.
- **Companies House** — profile, status, distress flags (accounts overdue, gazette
  strike-off, liquidation…), filing history with **PDF links**, plus the **real-time
  streaming API**: registry changes for tracked companies trigger an immediate
  context refresh (`COMPANIES_HOUSE_STREAM=true`).
- **Financial news** — per-company headlines with source links and sentiment.

Ingestion merges all of it into `data/company-context/<contactId>.json` — refreshed on
boot, via `POST /api/context/refresh`, or by stream events.

## The signal taxonomy (19 types, 5 categories)

**Cash recovery** (`signals/cash-recovery.ts`)
- `overdue-chase` — chase email, tone-matched to the customer's payment history
- `slip-risk-escalation` — worsening pattern → firmer chase, prioritised now
- `distress-collection` — CH-flagged customer → urgent collection **before** terms; never a payment plan
- `partial-payment-followup` — short payment → chase the balance
- `chronic-payer-soft-nudge` — always late but always pays → soft nudge + suggest upfront terms

**Revenue growth** (`signals/revenue-growth.ts`)
- `recurring-conversion` — repeat same-item buyer → recurring quote/invoice
- `reactivation-offer` — lapsed high-value customer → drafted quote
- `shrinking-basket-winback` — order value declining each cycle → early win-back
- `cross-sell` — buys line A, fits the profile of line-B buyers
- `good-news-upsell` — funding/expansion news → timed upsell (source cited)

**Cash flow timing** (`signals/cashflow-timing.ts`)
- `bills-vs-receivables` — defer some, pay others, stay cash-positive
- `early-payment-discount` — discount available and cash allows → flagged saving
- `supplier-distress` — CH-flagged supplier we depend on → alternate/prepay caution

**Strategic** (`signals/strategic.ts`)
- `concentration-risk` — "X% of revenue sits with 3 clients"
- `margin-drift` — a line's margin quietly dropping over months
- `churn-cohort-match` — behaving like customers ~2 months before they churned

**Anomaly / hygiene** (`signals/anomaly.ts`)
- `duplicate-invoice`, `amount-anomaly`, `terms-change`

Every signal carries `reasoning[]` (why it fired), `evidence[]` (CH filing PDFs, news
links), and a `recommendedAction`.

## The agent

`POST /api/agent/decide` hands the prioritised signals **plus each company's context
document** to Claude, which decides act-now / schedule / monitor / dismiss per signal
with explicit reasoning (e.g. holds a chase because of bad press, bumps an upsell
because funding landed). Without an API key a deterministic severity policy decides,
so the endpoint always works. Both paths return the same shape, tagged `decidedBy`.

## HTTP surface

```
GET  /api/signals[?category=]        prioritised signals
GET  /api/signals/summary            counts by category/severity
GET  /api/context                    all company dossiers
GET  /api/context/:contactId         one company (CH + filings + news)
POST /api/context/refresh            re-ingest Companies House + news
POST /api/agent/decide               agent decisions with reasoning

GET  /api/analytics/report           payment patterns, cadence, slip-risk, recoverable, churn
POST /api/actions/quotes             create quote (reactivation flagship)
POST /api/actions/invoices/draft     draft invoice (never auto-authorised)
POST /api/actions/payments           create payment
POST /api/actions/invoices/:id/chase-email   Claude-drafted chase email
GET  /api/actions/reactivation-proposals     auto-built offers for churn risks
```

## Quick start

```bash
npm install
cp .env.example .env     # all-fake adapters work with zero credentials
npm test                 # 56 tests, fully offline

npm run dev:api          # API on :4000 — ingestion primes context files on boot
npm run dev:web          # dashboard on :3000
```

### Going live
```
XERO_ADAPTER=mcp  XERO_CLIENT_ID=…  XERO_CLIENT_SECRET=…
COMPANIES_HOUSE_API_KEY=…   # developer.company-information.service.gov.uk
COMPANIES_HOUSE_STREAM=true # real-time registry change stream
NEWS_API_KEY=…              # NewsAPI.org-compatible
ANTHROPIC_API_KEY=…         # Claude agent decisions + chase emails
```

**GCP note**: not required at this stage — the context store is deliberately a narrow
3-method interface over local JSON files. If/when you want cloud storage (GCS),
Pub/Sub-driven ingestion or BigQuery analytics, implement `ContextStore` against them;
nothing above the interface changes. (`gcloud` is installed locally with project
`labs-501018` if you decide to.)

## Tests

- `packages/core/src/analysis/analysis.test.ts` — 17 unit tests, base four-archetype fixture.
- `packages/core/src/signals/signals.test.ts` — 22 tests: **every signal type** has a
  dedicated archetype in `testing/demo-enriched.ts` and an assertion.
- `apps/api/src/app.test.ts` — 17 supertest integration tests: signals API, context-file
  ingestion (verifies the JSON on disk, CH flags, PDF + news links), agent decisions,
  and all write paths.

## Extending

- **New signal**: add a detector in `packages/core/src/signals/`, register it in
  `engine.ts`, give it an archetype in `demo-enriched.ts`, assert it in `signals.test.ts`.
- **New intelligence source** (credit scores, court records…): define a port in core,
  adapt it in `apps/api/src/adapters`, merge it into `CompanyContext` in the ingestion
  service — the agent sees it automatically.
