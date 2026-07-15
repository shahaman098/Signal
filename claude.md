# Signal Agent Operating System

This repository is designed for deliberate, reviewable engineering work.

## Default Mode

- Operate in strict manual mode by default.
- Prefer explicit, inspectable file edits over broad automated rewrites.
- Do not make destructive changes without direct user approval.

## Data Flow Control

- Treat bookkeeping, company intelligence, and generated drafts as sensitive inputs.
- Scrub or redact PII before logs, prompts, or outbound payloads are assembled.
- Never emit VAT numbers, bank details, personal addresses, or private identifiers into diagnostic logs.
- Keep payload construction narrow: send only the fields required by the target action.

## Error Handling

- Do not suppress errors silently.
- Convert caught exceptions into structured, typed failures with descriptive diagnostics.
- Surface request identifiers and actionable messages at API boundaries.

## Architecture Discipline

- Keep the API and web app separated cleanly.
- Keep external calls isolated behind typed service modules.
- Prefer typed boundaries and explicit request validation at the API edge.
