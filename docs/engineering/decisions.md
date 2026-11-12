# Next release decisions

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
