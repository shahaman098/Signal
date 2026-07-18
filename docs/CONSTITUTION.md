# Signal Product Constitution

The non-negotiable principles that govern what Signal is, how it behaves, and what it refuses to do. Any change that violates one of these articles is a regression, regardless of how useful it looks.

## Article 1 — Purpose

Signal exists to turn scattered public creative-market evidence into a single, reviewable creative action plan. It automates the evidence-gathering and first-pass decision work of creative refresh planning for growth and marketing teams. It is a decision-support agent, not a decision-maker.

## Article 2 — The Human Boundary

1. Every autopilot run terminates in `pending_human_review`. No code path may mark a run approved.
2. Signal never autonomously publishes ads, moves budget, or modifies a live campaign.
3. Every recommendation ships with explicit human checkpoints (brand fit, platform fit, novelty) that an operator must confirm before production handoff.

## Article 3 — Truth Over Availability (Fail Closed)

1. Production routes never serve seeded, fixture, mock, or fabricated fallback data. Missing configuration returns `503 CreativeNotConfigured` — an honest error beats a fake answer.
2. Upstream responses marked `fallback` are rejected, not passed through.
3. Localhost upstreams are rejected in production.
4. Model-derived estimates must be labeled as such. In Qwen-only mode, health scores are model-assisted public-web estimates, never presented as authenticated ad-account metrics.

## Article 4 — Typed Boundaries

1. Every external input — upstream backend JSON, Qwen completions, operator API requests — is schema-validated (Zod) before it reaches business logic or the UI. Unvalidated data does not cross a boundary.
2. Errors are structured and typed (`CreativeConfigError`, `CreativeUpstreamError`), never silently suppressed, and surface actionable messages with correct HTTP status codes at the API edge.

## Article 5 — Evidence Before Opinion

1. Recommendations are grounded in the computed portfolio state: weakest family, strongest competitor signal, and open pattern territory are derived deterministically from the data, not improvised by the model.
2. The action type (`refresh_family`, `test_white_space`, `counter_competitor`, `scale_winner`) is chosen by deterministic rules; the model supplies narrative and strategy, not the verdict.
3. Every run returns its evidence packet alongside its recommendation so the operator can audit the reasoning.

## Article 5a — Self-Audit Before Signature

1. No packet reaches the operator without an adversarial audit: a second model pass, independent of the one that produced the recommendation, grades every factual claim as `verified`, `unverified`, or `model_estimate`.
2. Every source URL the model cites is fetched and its live reachability recorded in the packet. A claim is never presented as verified without a reachable source or independent confirmation.
3. When the audit itself fails, the packet reports `audit_unavailable` — an honest absence of a verdict, never an invented one.
4. The human gate is enforced, not advisory: runs are registered in an append-only review ledger, approval requires explicit acknowledgement of every human checkpoint, and every decision is recorded with operator, note, and timestamp.

## Article 6 — Credential and Data Hygiene

1. Model credentials live server-side only (`.env` or cloud secret store) and are never sent to the browser; the client speaks only to the server-side proxy.
2. Payloads are narrow: only the fields the target action requires are sent.
3. PII, VAT numbers, bank details, and private identifiers never enter logs, prompts, or outbound payloads.

## Article 7 — Verifiability

1. Claims about the product must be provable by command: `implementation:check` (repo integrity), `live:check` (deployed cloud behavior), `submission:check` (release readiness).
2. Deployment paths not backed by live proof are labeled optional expansion paths, never claimed as running infrastructure.

## Article 8 — Scope Discipline

The API, web app, and MCP service stay cleanly separated. External calls stay isolated behind typed service modules. The product does one workflow — creative diagnosis and refresh planning — and does it end to end rather than doing many workflows shallowly.
