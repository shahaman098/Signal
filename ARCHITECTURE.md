# Signal — Architecture

**Signal** is a financial-intelligence layer over a small business's books: it reads
accounting data from **Xero**, enriches every counterparty with **Companies House**
registry data, **The Gazette** (official public record) and **financial news**, derives
statistically-grounded signals across five categories, and routes every proposed action
through a **human-in-the-loop Plan stage** — with an **AI confirmation pass** checking the
numbers before a human ever reviews them.

```
┌──────────────┐   HTTP    ┌────────────────────────────────────┐
│   apps/web   │ ────────► │             apps/api               │
│   Next.js    │           │  Express · ports-and-adapters      │
│              │           │                                    │
│  /            Overview   │  ┌──────────┐  ┌───────────────┐   │      ┌─────────────────┐
│  /receivables Money      │  │ Analytics │  │  Ingestion    │──┼────► │ Companies House  │
│  /companies   Intel      │  │ (snapshot │  │ (context files│  │      │ REST + stream    │
│  /plan        Decisions  │  │  + cache) │  │  per company) │──┼────► │ Gazette (Atom)   │
│              │           │  └────┬─────┘  └──────┬────────┘  │      │ News: Google RSS │
└──────────────┘           │       │               │           │      │ Bing RSS · GDELT │
                           │  ┌────▼───────────────▼────────┐  │      │ NewsAPI (keyed)  │
                           │  │        SignalsService        │  │      └─────────────────┘
                           │  │  runSignalEngine(enriched)   │  │
                           │  └────┬────────────────────────┘  │      ┌─────────────────┐
                           │  ┌────▼─────┐  ┌──────────────┐   │      │      Xero        │
                           │  │  Agent    │  │  Proposals   │──┼────► │  via MCP server  │
                           │  │ (Gemini/  │  │ (Plan stage, │  │      │  (stdio, text    │
                           │  │  rules)   │  │  AI-verified)│  │      │   protocol)      │
                           │  └──────────┘  └──────────────┘   │      └─────────────────┘
                           └────────────────────────────────────┘      ┌─────────────────┐
                                        depends on                     │  Gemini 3.5     │
                           ┌────────────────────────────────────┐      │  decisions ·    │
                           │           packages/core            │◄─────│  chase drafts · │
                           │  pure domain · analysis · signals  │      │  verification   │
                           │  (no frameworks, no I/O, no keys)  │      └─────────────────┘
                           └────────────────────────────────────┘
```

---

## 1. Layering

| Layer | Path | Rules |
|---|---|---|
| **Core** | `packages/core` | Pure TypeScript. Domain types, Zod schemas, port interfaces, the analysis layer and the signal engine. No frameworks, no network, no clock beyond the snapshot's `asOf`. Trivially unit-testable. |
| **API** | `apps/api` | Express. Adapters implement core's ports; services orchestrate; routes expose HTTP. Every external system has a **fake adapter**, so the full test suite runs offline. |
| **Web** | `apps/web` | Next.js 14 (app router). Server components fetch from the API; small client components handle actions. Shared design system in `app/globals.css` + `app/components.tsx`. |

**Ports (defined in core, implemented in api):**

| Port | Real adapter | Fake |
|---|---|---|
| `XeroPort` | `XeroMcpAdapter` — official Xero MCP server over stdio; the tools return *formatted text*, parsed by tested text-protocol parsers | `FakeXeroAdapter` (deterministic archetype fixture) |
| `CompanyIntelPort` | `CompaniesHouseAdapter` — REST (search/profile/filings/officers/charges/insolvency) + streaming change feed | `FakeCompanyIntelAdapter` |
| `NewsPort` | `CompositeNewsAdapter` → Google News RSS + Bing RSS + GDELT (all keyless) + NewsAPI (keyed) | `FakeNewsAdapter` |
| `GazettePort` | `GazetteAdapter` — keyless Atom feed of official notices | `FakeGazetteAdapter` |
| LLM | `GeminiClient` (`@google/genai`, default `gemini-3.5-flash`) | key absent → deterministic fallbacks |

---

## 2. Data in

**Xero (via MCP)** — contacts, invoices (ACCREC), payments, bills + suppliers (derived
from ACCPAY invoices), line items (second-pass enrichment for the most recent invoices).
Aged-receivable buckets are computed locally from open invoices. Snapshots are cached
(30 min in live mode), deduped across concurrent callers, persisted to disk, and served
stale when Xero is rate-limited — a dead upstream never kills the dashboard.

**Company intelligence** — per contact, ingestion merges into one JSON file
(`data/company-context/{adapter}/<contactId>.json`):
- **Companies House**: profile + status flags (accounts overdue, gazette strike-off,
  liquidation…), filing history with public **PDF links**, officers (+`recent-officer-exodus`),
  outstanding charges, insolvency history, accounts-next-due. **Tiered name matching**
  protects against wrong-company joins: `exact` → auto; `probable` (all name tokens
  contained) → auto + badge; otherwise top-3 candidates stored for **human confirmation**
  (`PUT /api/context/:id/company-number` pins permanently). *No data beats wrong data.*
- **The Gazette**: official insolvency/strike-off notices, name-filtered.
- **News**: multi-source composite, relevance-filtered (core trading name must appear),
  deduped by URL/title, keyword sentiment.

Real-time: the Companies House **streaming API** (separate stream key) triggers a context
refresh the moment a tracked company files; without a stream key, 12-hour polling.

---

## 3. The analysis layer — real algorithms

All derivations are pure functions over one snapshot (`packages/core/src/analysis`).
The scoring models are statistical, calibrated per customer, with named constants:

**Payment pattern** (`payment-pattern.ts`)
- Per customer: mean and population **σ** of settlement lateness.
- **Trend = OLS regression slope** of lateness over settlement order (days of added
  lateness per invoice); `worsening`/`improving` fires at |slope| > 3 d/invoice.
  Robust to where the series is split, unlike half-vs-half comparisons.
- Reliability `n/(n+1)` — saturating confidence in the sample.

**Slip risk** (`slip-risk.ts`) — *"how far outside this customer's own behaviour is this
invoice, and is that behaviour deteriorating?"*
1. Customer lateness distribution (μ, σ) with **empirical-Bayes shrinkage** toward the
   portfolio prior (`(n·local + k·prior)/(n+k)`, k = 3): 2 data points mostly inherit the
   book's behaviour; 20 speak for themselves. New customers get the portfolio distribution.
2. **z-score** the invoice's days-overdue against that distribution (σ floored at 3d).
3. Add the OLS trend term; squash through a **logistic link**:
   `risk = σ(0.9·z + 0.6·slope/10 − 0.6)` → (0,1); bands at 0.33 / 0.66.
- Every score ships its reasoning: *"50 days overdue — 2.9σ beyond their typical
  settling point (~17d ±11d)"*.

**Expected recoverable** (`recoverable.ts`) — `amountDue × (1 − risk)`, ranked; portfolio
totals for outstanding vs realistically collectable.

**Order cadence** (`order-cadence.ts`)
- Frequency = **median** inter-order gap (one holiday gap can't redefine cadence) + gap σ.
- **Statistical lapse point**: recency > μ + 2σ of the customer's own gap distribution
  (their current silence sits in the top ~2.5% of historical gaps), floored at 90d
  absolute so sparse data can't hair-trigger.

**Churn** (`churn.ts`) — weighted blend of:
- recency: **z-score of current silence vs own gap distribution** → logistic;
- volume: proportional drop, recent 180d window vs prior window;
- payment: worsening-trend flag + lateness saturation.

**Cohort match** (`signals/strategic.ts`) — fingerprint of churned customers' final
gap-stretch ratio; active customers matching ≥ 0.8× of it (with worsening payments)
are flagged as *"behaving like customers ~2 months before they churned"*.

**Duplicate detection** (`signals/anomaly.ts`) — amount within ±0.5% AND issued ≤ 7d
apart AND **token-Jaccard similarity of line-item descriptions ≥ 0.5** — two different
services at the same price are not a duplicate.

Amount anomalies use the historical **median** (×3 / ÷3); terms changes compare to the
customer's **modal** terms.

---

## 4. The signal taxonomy — 19 types, 5 categories

Every detector emits a uniform `Signal`: severity, 0–1 score, **reasoning chain**,
**evidence links** (CH filing PDFs, Gazette notices, news URLs) and a typed
`recommendedAction`. The engine dedupes (one cash-recovery signal per invoice, most
severe wins) and ranks severity-then-score.

| Category | Signals |
|---|---|
| **Cash recovery** | overdue-chase (tone-matched to history) · slip-risk-escalation · distress-collection (CH-flagged → urgent, never a payment plan) · partial-payment-followup · chronic-payer-soft-nudge (suggest upfront terms) |
| **Revenue growth** | recurring-conversion · reactivation-offer (lapsed high-value) · shrinking-basket-winback · cross-sell (peer-profile match) · good-news-upsell (timed to funding/expansion news) |
| **Cash flow timing** | bills-vs-receivables (defer/pay plan) · early-payment-discount (when cash allows) · supplier-distress (dependency share) |
| **Strategic** | concentration-risk (top-3 share) · margin-drift (monthly margin trend per item) · churn-cohort-match |
| **Anomaly / hygiene** | duplicate-invoice · amount-anomaly · terms-change |

---

## 5. Decisions, the Plan stage, and AI

**Agent decisions** (`agent.service.ts`) — signals + each company's full dossier go to
**Gemini** (structured JSON output: act-now / schedule / monitor / dismiss + reasoning +
priority). Offline, a deterministic severity policy decides. Output is tagged
`decidedBy: "gemini" | "rules"`.

**Plan stage** (`proposal.service.ts`, `/plan`) — the human-in-the-loop core:
- `generate` turns actionable decisions into **proposals**: frozen artifacts carrying the
  decision + reasoning chain + evidence + **input data** (metric chips + per-contact chart
  series: lateness bars, order-value trend) + the exact `prepared` payload approval will send.
- **Policy**: drafts auto-execute (chase-email drafts — nothing customer-visible);
  quotes/payments wait for explicit approval.
- **AI confirmation pass**: after generation, Gemini receives each pending proposal's
  *derived claims and the raw series they were computed from*, and audits them —
  `confirmed` or `needs-review` with a note. Rendered as a badge on the proposal card.
  Best-effort: absent offline, never blocks generation.
- Lifecycle: `proposed → approved → executed | failed`, `rejected`, `superseded` (signal
  disappeared). Idempotent regeneration (fingerprint dedupe), staleness check at approval
  (409 unless `force`), concurrent-approve guard, failure captured as data. Full audit
  trail persisted one JSON file per proposal.

**Writes to Xero** — create-quote (verified live: quotes ride on the `accounting.invoices`
granular scope), create-invoice (server-hardwired DRAFT), create-payment. All write
results carry Xero **deep links**. Chase emails are drafted (Gemini or template), never
sent by the system — sending stays human, outside Xero.

---

## 6. Data stores & isolation

File-per-entity JSON stores — human-inspectable, diffable, swappable for GCS/DB later
(each store is a ~4-method interface). **Everything is adapter-scoped** so demo and real
data can never cross-contaminate:

```
data/company-context/{fake|mcp}/<contactId>.json    counterparty dossiers
data/proposals/{fake|mcp}/<proposalId>.json         Plan-stage audit trail
data/cache/last-snapshot.{fake|mcp}.json            stale-serve fallback
```

Context files are schema-normalised on load (the store outlives code versions).

---

## 7. Configuration

| Env | Purpose | Default |
|---|---|---|
| `XERO_ADAPTER` | `mcp` (real) / `fake` (demo archetypes) | `fake` |
| `XERO_CLIENT_ID/SECRET` | Custom-connection credentials | — |
| `XERO_SCOPES` | Granular scopes (no `accounting.transactions` exists for new apps; quotes ride on `accounting.invoices`) | contacts · settings · invoices · payments · reports.aged.read |
| `COMPANIES_HOUSE_API_KEY` | REST key (registry reads) | — → fake intel |
| `COMPANIES_HOUSE_STREAM_KEY` | Separate stream-type key | — → 12h polling |
| `NEWS_API_KEY` | Optional NewsAPI source (keyless sources always run) | — |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Decisions, drafts, verification | — → rules/templates · `gemini-3.5-flash` |
| `SNAPSHOT_TTL_MS` | Snapshot cache TTL | 30 min (mcp) / 1 min (fake) |
| `CONTEXT_DIR` / `PROPOSALS_DIR` | Store roots (adapter subdir appended) | `data/…` |
| `XERO_DEFAULT_TAX_TYPE` / `ACCOUNT_CODE` | Stamped on created line items (UK VAT: `OUTPUT2`) | `NONE` / `200` |

---

## 8. Resilience patterns (all born from live incidents)

- **Stale-serve snapshots**: fetch fails (Xero 5k/day quota, network) → serve last-known
  data from memory or disk, flag `staleSince`, keep the dashboard alive.
- **In-flight dedupe**: concurrent dashboard requests share one snapshot sweep (thundering-herd fix).
- **Wrong-data guards**: CH tiered name matching; adapter-scoped stores; docless filings
  get no PDF link; news relevance filters; auth failures on the CH stream disable it with
  one actionable log line instead of infinite retry.
- **Graceful LLM degradation**: every Gemini touchpoint has a deterministic fallback
  (rules policy, template email, skipped verification).
- **Source drop-out**: any news source failing simply drops out of the composite merge.

---

## 9. Testing

98 offline tests (`npx vitest run`), no keys needed:
- `packages/core` — stats toolkit (median/σ/OLS/logistic/shrinkage), analysis layer over
  a deterministic four-archetype fixture, **every one of the 19 signal types** asserted
  against a purpose-built enriched fixture.
- `apps/api` — supertest integration over the full HTTP surface with fakes; Xero MCP
  **text-protocol parsers** tested against the server's exact formatter output; CH name
  tiers; RSS/Gazette parsers; proposal lifecycle (generate/dedupe/approve/409s/supersede/
  failure capture/persistence); AI verification via stubbed LLM.

Live-verified against real services during development: Xero writes with read-back
(quote QU-0001 + draft invoice confirmed in the org), Companies House distress flags
(Carillion → liquidation flags), clickable filing PDFs (302 → signed document), and
multi-source news for real companies.

## 10. Known limits / next steps

- News sentiment is keyword-based — upgrade path is a Gemini classification call.
- Slip-risk constants (weights, bias, k) are calibrated, not learned — with enough
  settled-invoice history they could be fit by logistic regression on actual outcomes.
- Payments are unit-tested but not live-verified (a live payment would alter real books).
- Chase emails are drafted, not sent — an outbound email integration is deliberately out
  of scope until the Plan-stage approval flow has earned trust.
