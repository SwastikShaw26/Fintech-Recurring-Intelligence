# Next release decisions

## Assigned tasks approved — 15 November 2026

The user authorized Tasks 2 → 1 → 4 with no commit, push, staging, installation or frozen-data edits. Use review-first evidence only: NFKC/case/token spacing, bounded channel/reference/VPA extraction and explicit confirmation. Labelled references require 6–35 alphanumeric characters and at least six digits; unlabelled numbers/numeric brands remain. VPA syntax is intentionally narrow and is not verified identity. Multiple/malformed VPAs and stacked channel prefixes abstain from derived suggestions; descriptors beyond the existing 250-character bound also abstain. Generic-provider-only evidence is insufficient.

Keep detection keys and hash construction unchanged. Expand calendar hypotheses, not acceptance thresholds; retain irregular membership while flagging weekly-looking histories. Extend StatementImport without replacing parser/mapping/storage. No persistent merchant system or automatic private-import aliases. Frozen dashboard results remain historical provenance; regression tests compare semantics and current source fingerprint separately.

Final closure authorization permits only documented Playwright tooling/browser installation in disposable external storage. No production dependencies or lockfiles changed. New automatic resolution was evaluated and declined: the trusted map authorizes exact descriptors only; stripping additional content or applying configuration aliases privately would expand grouping and alter commitment identities/user-consent behavior without independent business-identity evidence. A synthetic regression verifies existing exact resolution, refusal to auto-resolve a stripped variant, private-import isolation and explicit-link behavior.

The active release goal authorizes the audited improvements, including private statement CSV import and verification with an authorized real dataset.

- FastAPI is the canonical local demo backend. The launcher generates disposable synthetic outputs and serves a freshly built SPA on the same origin.
- The Node backend remains a synthetic demo adapter. Its boundary controls apply even though its response contract still differs.
- Real-statement data must stay outside Git and external services. Verification of import and analysis is separate from accuracy evaluation, which needs reliable labels.

## Hosted statement storage

Hosted storage is opt-in and keeps its dependencies separate from local mode. The initial PostgreSQL migration stores encrypted snapshots with owner-scoped access and a retention deadline. The database can index owner and statement UUIDs and expiry timestamps without reading the snapshot contents. Authentication must supply the owner UUID before the storage operations can be exposed over HTTP.

## Hosted session design for the next implementation phase

Exchange the operator credential for a random short-lived bearer and store only its digest, owner UUID and expiry. Resolve active sessions from PostgreSQL on each request to support revocation across workers. The statement endpoint will accept only the session bearer. Keep the session in tab memory, revoke by digest on sign-out, and invalidate sessions before serving a restored database. Bound exchange and lookup traffic and verify migration from revision 0001 with existing encrypted snapshots.

## Approved product expansion

The user approved the five numbered product expansions from the latest re-audit. The implementation uses separate workstreams for import quality, hosted account history and calendar export. Cash scenarios and commitment activity integrate with the existing Forecast and commitment detail views. All five retain the synthetic and local workflows. Cash scenarios stay in browser memory, exports are user-initiated, and mandate reports remain distinct from issuer confirmation.

## Sarvam explanations for Ask FinSight

The user approved an optional English or Hindi explanation of local ledger evidence. The browser submits the evidence type, count, and forecast window when applicable. The local FastAPI wrapper requires consent and constructs the provider prompt from those fields. The existing ledger answer remains available independently of the provider.
