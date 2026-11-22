# FinSight Architecture and Workflow

## 1. System Architecture

FinSight is a React 19 and TypeScript application built with Vite. FastAPI in
`src/api.py` is the canonical backend and serves the built frontend. The
production wrapper `src/sarvam_app.py` mounts that app and adds the optional
Sarvam route. The backend runs the V3 recurring-payment detector and connects
to optional Neo4j Aura, hosted PostgreSQL, local SQLite, and Sarvam AI services.

### High-level system diagram

This diagram separates the browser, backend, and data layers and shows the
primary code-level connections.

```mermaid
graph TD
  subgraph Frontend[Frontend]
    React[React 19 + TypeScript]
    Vite[Vite]
    Panels[ForecastPanel<br/>GraphEvidencePanel<br/>BusinessExpensePlanner<br/>LedgerAssistant]
    Vite --> React --> Panels
  end
  subgraph Backend[Backend]
    API[src/api.py<br/>canonical FastAPI app]
    Wrapper[src/sarvam_app.py]
    Detector[src/detect_recurring_v3.py]
    Forecast["build_commitments()<br/>compute_forecast_quality()"]
    GraphRoutes[src/graph_routes.py]
    AuthRoutes[src/auth_routes.py]
    Assistant[src/assistant_routes.py]
    Auth[src/auth.py]
    Wrapper --> API
    API --> Detector
    API --> Forecast
    API --> GraphRoutes
    API --> AuthRoutes
    API --> Assistant
    AuthRoutes --> Auth
  end
  subgraph Data[Data and external services]
    Aura[Neo4j Aura]
    PG[Hosted PostgreSQL]
    SQLite[SQLite local fallback]
    Sarvam[Sarvam AI]
  end
  React -->|HTTP and static assets| Wrapper
  GraphRoutes --> Aura
  Auth --> PG
  Auth --> SQLite
  API --> PG
  Assistant --> Sarvam
```

### CSV-to-result data flow

The browser previews a CSV, sends mapped rows to the private endpoint, and
receives derived transactions, commitments, alerts, and forecasts. Graph
ingestion is started separately from the response path.

```mermaid
graph LR
  CSV[CSV statement] --> Preview[POST /api/private-statement<br/>preview]
  Preview --> Map["parse_statement()<br/>map_statement()"]
  Map --> Detect[detect()<br/>V3 detector]
  Detect --> Build[build_commitments()<br/>compute_forecast_quality()]
  Build --> Result[Analysis response]
  Result --> Browser[React frontend]
  Build --> Thread[Background ingest_analysis()]
  Thread --> Aura[(Neo4j Aura)]
  Hosted[POST /api/hosted-statement] --> HostedRuntime[HostedRuntime.statement_action()]
  HostedRuntime --> PG[(PostgreSQL hosted_statements)]
  Auth[Auth routes] --> Users[(finsight_users)]
```

### Database architecture

PostgreSQL stores hosted encrypted statements, hosted sessions, and
`finsight_users`. Neo4j stores the traversable evidence graph. The graph
service also keeps a process-memory fallback for local/demo operation when Aura
is not configured.

```mermaid
erDiagram
  finsight_users {
    TEXT user_id PK
    TEXT email UK
    TEXT full_name
    TEXT password_hash
    TEXT salt
    TEXT created_at
  }
  hosted_statements {
    UUID id PK
    UUID owner_id FK
    BYTEA payload
    BYTEA payload_nonce
    UUID lineage_id
    INTEGER version
    TIMESTAMP expires_at
  }
  hosted_sessions {
    UUID token_digest PK
    UUID owner_id FK
    TIMESTAMP expires_at
  }
  Analysis {
    string analysis_id PK
    string user_id
  }
  Transaction {
    string transaction_id PK
    string analysis_id
    string description
    float amount
    string date
  }
  Descriptor {
    string text PK
    string analysis_id
  }
  Merchant {
    string merchant_id PK
    string analysis_id
    string display_name
  }
  Commitment {
    string commitment_id PK
    string analysis_id
    string cadence
    string status
  }
  finsight_users ||--o{ hosted_statements : owns
  finsight_users ||--o{ hosted_sessions : authenticates
  Analysis ||--o{ Transaction : HAS_TRANSACTION
  Analysis ||--o{ Commitment : HAS_COMMITMENT
  Transaction }o--o{ Descriptor : HAS_DESCRIPTOR
  Descriptor }o--o{ Merchant : NORMALIZES_TO
  Transaction }o--o{ Merchant : PAID_TO
  Transaction }o--o{ Commitment : SUPPORTS
  Commitment }o--|| Merchant : BELONGS_TO_MERCHANT
```

### Deployment architecture

The Dockerfile builds the frontend in Node 26, copies `frontend/dist` into a
Python 3.12 image, and runs one Uvicorn process on Render. Neo4j Aura and
Render PostgreSQL remain external managed services.

```mermaid
graph TD
  Source[Repository] --> Node[Node 26 frontend build stage]
  Node --> Npm[npm ci and npm run build]
  Npm --> Dist[frontend/dist]
  Source --> Python[Python 3.12 backend stage]
  Python --> Pip[pip install requirements.txt]
  Dist --> Python
  Python --> Uvicorn[uvicorn src.sarvam_app:app]
  Uvicorn --> Render[Render single Docker container]
  Render --> Aura[Neo4j Aura]
  Render --> PG[Render PostgreSQL]
```

### Private-data boundary

The original CSV stays in the browser for private analysis. The private API
receives it for parsing and derivation, while optional graph ingestion receives
structured analysis evidence. Sarvam receives only an allowlisted summary after
explicit consent. Hosted persistence is a separate authenticated workflow.

```mermaid
graph LR
  Browser[Browser<br/>original CSV] -->|mapped request| Private[POST /api/private-statement]
  Private --> Derived[Derived evidence]
  Derived --> Browser
  Derived -. optional structured evidence .-> Aura[Neo4j Aura]
  Browser -->|consent + summary| AI[POST /api/assistant/explain]
  AI --> Sarvam[Sarvam AI]
  Hosted[Authenticated hosted save] --> PG[(Encrypted PostgreSQL)]
```

### Component dependency matrix

| Dependency | If unavailable | Recovery |
|---|---|---|
| Neo4j Aura | Graph lookup may use memory/demo evidence or return 503 | Restore `NEO4J_*` settings and re-ingest |
| Hosted PostgreSQL | Hosted readiness/session/snapshot operations fail; auth can fall back to SQLite | Restore database connectivity and restart |
| Local SQLite | Local auth or optional local workspaces become unavailable | Use a writable `FINSIGHT_DATA_DIR`/`FINSIGHT_LOCAL_DB` |
| Sarvam AI | Assistant returns unavailable; local evidence remains | Configure `SARVAM_API_KEY` or use rule-based answers |

### Scalability notes

The single container keeps the browser API, detector, static files, and
optional integrations in one release boundary. A microservice deployment would
separate the frontend/CDN, detector worker, graph-ingestion worker, auth API,
and hosted-storage API behind durable queues, shared observability, and explicit
analysis ownership. The browser-first private CSV boundary should remain.

### Environment variables

| Name | Purpose | Required | Default |
|---|---|---:|---|
| `FINSIGHT_DEPLOYMENT_MODE` | Local/private/hosted behaviour | Optional | `local` in routes; Docker `private` |
| `FINSIGHT_FRONTEND_DIST` | Static frontend directory | Optional | `frontend/dist` |
| `FINSIGHT_PROCESSED_DIR` | Detector outputs | Optional | `data/processed` |
| `CORS_ALLOWED_ORIGINS` | Allowed browser origins | Optional | Localhost origins |
| `FINSIGHT_HOSTED_DATABASE_URL` | Hosted SQLAlchemy PostgreSQL URL | Hosted | Empty |
| `FINSIGHT_HOSTED_ENCRYPTION_KEY` | Hosted AES-GCM key | Hosted | None |
| `FINSIGHT_HOSTED_FALLBACK_KEYS` | Previous encryption keys | Optional | `[]` |
| `FINSIGHT_HOSTED_ORIGIN` | Exact HTTPS origin | Hosted | None |
| `FINSIGHT_HOSTED_CREDENTIALS` | Operator credential map | Hosted | None |
| `FINSIGHT_DATA_DIR` | Local auth data and secret directory | Optional | `/tmp/finsight_data` on POSIX; repository `data` on Windows |
| `FINSIGHT_LOCAL_DB` | Optional local workspace path | Optional | Disabled |
| `FINSIGHT_AUTH_SECRET` | HMAC token secret | Optional | Persisted `.auth_secret` fallback |
| `NEO4J_URI` | Aura URI | Optional | Empty |
| `NEO4J_USERNAME` / `NEO4J_USER` | Aura user | Optional | `neo4j` |
| `NEO4J_PASSWORD` | Aura password | Optional | Empty |
| `NEO4J_SECURE_SCHEME` | Aura scheme conversion | Optional | `neo4j+s://` |
| `SARVAM_API_KEY` | Server-side Sarvam key | Optional | Empty |
| `SARVAM_MODEL` | Sarvam model | Optional | `sarvam-105b-conversations` |
| `VITE_API_URL` | Frontend API base | Optional | `/` in Docker |
| `VITE_FINSIGHT_HOSTED` | Hosted frontend mode | Optional | `false` |

## 2. Workflow

### Primary consumer workflow

This is the main import path from CSV preview through V3 detection, forecast
quality, asynchronous graph ingestion, and frontend rendering.

```mermaid
sequenceDiagram
  actor User
  participant FE as React frontend
  participant API as POST /api/private-statement
  participant V3 as detect() in detect_recurring_v3.py
  participant Build as build_commitments() and compute_forecast_quality()
  participant Graph as Neo4j ingestion thread
  User->>FE: Upload CSV
  FE->>API: Preview request
  API-->>FE: Columns, sample, row count
  User->>FE: Confirm column mapping
  FE->>API: Analyze mapped CSV
  API->>V3: detect(debits, aliases, namespace)
  V3-->>API: Candidates and predictions
  API->>Build: Build commitments and forecast metadata
  Build-->>API: Commitments, alerts, summary
  API-)Graph: ingest_analysis(analysis_id, result, user_id)
  API-->>FE: Analysis response
  FE-->>User: Render commitments and forecasts
```

### Neo4j evidence workflow

`GraphEvidencePanel.tsx` calls the graph route for a selected commitment. The
route can pass an authenticated user ID into the graph query for owner-scoped
matching.

```mermaid
sequenceDiagram
  actor User
  participant FE as GraphEvidencePanel.tsx
  participant Route as GET /api/graph/commitment/{id}/evidence
  participant Service as get_commitment_evidence()
  participant Aura as Neo4j Aura
  User->>FE: Click Load graph evidence
  FE->>Route: analysis_id, commitment_id, Bearer token
  Route->>Route: verify_token()
  Route->>Service: get_commitment_evidence(..., user_id)
  Service->>Aura: MATCH scoped Commitment, Transaction, Descriptor, Merchant
  Aura-->>Service: Evidence relationships
  Service-->>Route: Merchant, descriptors, supporting transactions
  Route-->>FE: JSON evidence response
  FE-->>User: Render relationship panel
```

### Freelancer classification workflow

Backend labels currently live in `_classifications` for the process lifetime.
The frontend planner also maintains a local selection and calculates a forecast
from the loaded commitments. `/api/summary/business` sums classified
`typical_amount` values when labels were submitted through the backend route.

```mermaid
sequenceDiagram
  actor User
  participant FE as BusinessExpensePlanner.tsx
  participant Classify as POST /api/graph/commitment/{id}/classify
  participant Memory as _classifications
  participant Summary as GET /api/summary/business
  participant Forecast as buildCommitmentForecast()
  User->>FE: Classify commitment business/personal
  FE->>Classify: expense_category + analysis_id
  Classify->>Memory: Update classification dictionary
  User->>FE: Request business summary
  FE->>Summary: analysis_id
  Summary->>Memory: Filter business entries
  Memory-->>Summary: Classified commitments
  Summary->>Summary: Calculate total_estimated_spend
  Summary-->>FE: Business IDs and total
  FE->>Forecast: Forecast selected commitments
  Forecast-->>FE: Monthly and annual estimate
  FE-->>User: Render freelancer summary
```

### User authentication workflow

`src/auth.py` hashes passwords with PBKDF2-HMAC-SHA256 and stores users in
`finsight_users` through SQLAlchemy. Hosted PostgreSQL is preferred; local
SQLite is the startup fallback. Tokens are HMAC-SHA256 signed and expiring.

```mermaid
sequenceDiagram
  actor User
  participant FE as React auth UI
  participant Route as POST /api/auth/register or /login
  participant Auth as src/auth.py
  participant DB as PostgreSQL finsight_users
  participant Token as HMAC-SHA256 token logic
  User->>FE: Enter credentials
  FE->>Route: Register or login
  Route->>Auth: register_user() or authenticate_user()
  Auth->>Auth: hash_password() with PBKDF2
  Auth->>DB: INSERT or SELECT finsight_users
  DB-->>Auth: User row
  Auth->>Token: create_token()
  Token-->>Auth: Signed expiring token
  Auth-->>FE: Profile and Bearer token
  FE->>Route: Subsequent request with Bearer token
  Route->>Token: verify_token()
  Token-->>Route: User identity or rejection
```

### Error handling flow

Validation errors stop before detector execution. Optional providers degrade to
local evidence, while hosted readiness failures remain explicit service errors.

```mermaid
graph TD
  Request[Request] --> Valid{Input valid?}
  Valid -- No --> ClientError[400 / 415 / 422]
  Valid -- Yes --> Operation[Run operation]
  Operation --> CSV{CSV valid?}
  CSV -- No --> ClientError
  CSV -- Yes --> Analysis[Return analysis]
  Operation --> Graph{Neo4j available?}
  Graph -- No --> Memory[Memory/demo evidence or 503]
  Graph -- Yes --> GraphResult[Graph response]
  Operation --> Auth{Token valid?}
  Auth -- No --> Unauthorized[401 / 403]
  Auth -- Yes --> Protected[Protected response]
  Operation --> Hosted{Hosted ready?}
  Hosted -- No --> Unavailable[503 hosted unavailable]
  Hosted -- Yes --> HostedResult[PostgreSQL operation]
```

### Private-data workflow

The private endpoint does not persist the original CSV. It returns derived
results and may send structured evidence to Neo4j. An explicit hosted save is a
separate authenticated operation.

```mermaid
sequenceDiagram
  actor User
  participant Browser
  participant Private as /api/private-statement
  participant Memory as In-memory evidence
  participant Aura as Optional Neo4j
  participant Hosted as /api/hosted-statement
  participant PG as Encrypted PostgreSQL
  User->>Browser: Select private CSV
  Browser->>Private: Send mapped CSV
  Private->>Private: Parse, detect, derive
  Private->>Memory: Store fallback evidence
  Private-->>Browser: Derived result
  Private-)Aura: Optional structured ingestion
  User->>Hosted: Explicitly save hosted statement
  Hosted->>PG: Authenticated encrypted snapshot
  Note over Browser,Private: Original private CSV is not persisted by the private endpoint
```

### Forecast staleness workflow

`compute_forecast_quality()` combines observation count, last-observed age,
observed span, and cadence reliability into warning metadata consumed by the
forecast UI.

```mermaid
graph LR
  Tx[Transactions] --> Build[build_commitments()]
  Build --> Quality[compute_forecast_quality()]
  Quality --> Count[observation_count]
  Quality --> Age[last_observed_days_ago]
  Quality --> Span[statement_days_covered]
  Quality --> Cadence[cadence_estimate_reliable]
  Count --> Warn{Sparse, stale, or irregular?}
  Age --> Warn
  Span --> Warn
  Cadence --> Warn
  Warn -- Yes --> Caveat[Limited evidence warning]
  Warn -- No --> Estimate[Forecast estimate]
  Caveat --> Panel[ForecastPanel.tsx]
  Estimate --> Panel
```

### CSV preview and analysis workflow

The first request omits `mapping` and returns a bounded preview. The second
request maps semantic columns and only then invokes the detector.

```mermaid
sequenceDiagram
  actor User
  participant Import as StatementImport.tsx
  participant API as /api/private-statement
  participant Parse as parse_statement()
  participant Map as map_statement()
  participant Detect as detect()
  User->>Import: Select/drop CSV
  Import->>API: POST {csv}
  API->>Parse: Parse UTF-8 CSV
  Parse-->>API: Headers, sample, row count
  API-->>Import: Preview
  User->>Import: Choose date/description/amount columns
  Import->>API: POST {csv, mapping, currency}
  API->>Parse: Validate rows
  Parse->>Map: Normalize mapped fields
  Map->>Detect: Debit transactions
  Detect-->>API: Candidates and predictions
  API-->>Import: Analysis result
```

## Key Design Decisions

### Neo4j alongside PostgreSQL

PostgreSQL is appropriate for transactional users, sessions, and encrypted
hosted snapshots. Neo4j complements it by making evidence traversals from
analysis to transactions, descriptors, merchants, and commitments explicit.

### Single Docker container

The MVP has one tightly coupled static frontend, FastAPI API, detector, and
provider boundary. A two-stage image is simple to release on Render. A future
microservice split would need durable queues, a detector worker, graph worker,
centralized secrets, and explicit ownership/observability contracts.

### CSV instead of a bank API

CSV avoids collecting banking credentials and avoids claiming live bank
connectivity. Browser preview and mapping give users control over the rows sent
for analysis and keep the detector evidence explainable.

### PBKDF2 over bcrypt

PBKDF2-HMAC-SHA256 uses the Python standard library, a random salt, and an
explicit work factor without adding a native password-hashing dependency. A
future migration should use a versioned hash format and rehash policy.

## Failure Modes

| Component | Failure mode | System behaviour | Recovery path |
|---|---|---|---|
| CSV parser | Bad encoding, columns, dates, or amounts | Clear 400/415/422 validation response | Correct mapping or upload valid UTF-8 CSV |
| V3 detector | Sparse or irregular history | Low-confidence/no candidate and evidence caveats | Import a longer history and review transactions |
| Neo4j Aura | Missing URI, bad credentials, or query failure | Memory/demo evidence or 503 graph response | Restore `NEO4J_*` settings and re-ingest |
| PostgreSQL | Hosted DB unavailable or schema missing | Hosted readiness/session operations fail; auth falls back to SQLite | Restore DB connectivity/schema and restart |
| SQLite | Local data directory cannot be opened | Auth initialization is swallowed; local workspaces report unavailable | Set writable `FINSIGHT_DATA_DIR`/`FINSIGHT_LOCAL_DB` |
| Auth token | Missing, expired, or invalid HMAC | 401/403 protected-route response | Log in again |
| Sarvam AI | Missing key, timeout, or provider error | 503/consent rejection; local evidence remains | Configure `SARVAM_API_KEY` or use local assistant |
| Hosted session | Expired or revoked session | Request rejected before snapshot access | Re-authenticate |
| Render | Build or startup failure | Health check fails; deployment is not ready | Inspect build logs, variables, `/api/ready`, and Uvicorn entry point |
