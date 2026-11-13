# 8. Operating FinSight

This chapter takes you from the synthetic container to a private hosted test with PostgreSQL. Start with a disposable database and the bundled example transactions. The hosted workflow has been exercised on disposable infrastructure. Public release and its operational controls are separate decisions.

## 8.1 Choose the right mode

| Mode | What you run | What it can store | What you need |
| --- | --- | --- | --- |
| Local workspace | FastAPI and the React frontend on your computer | Optional SQLite copies on that computer | Python, Node, npm. A database path only if you choose to save. |
| Synthetic container | The image built by the repository Dockerfile | Bundled demonstration artifacts | A running Docker engine. |
| Hosted workspace | FastAPI serving a hosted React build from the same HTTPS origin | Owner-scoped encrypted PostgreSQL snapshots | PostgreSQL, hosted Python dependencies, TLS, and operator-provisioned credentials. |

**Loopback** means a network address that refers to this computer. In these exercises the loopback address is `127.0.0.1`. A **port** is a numbered entrance to a service. Two programs generally cannot listen on the same address and port simultaneously.

The **origin** is the scheme, hostname, and port. In `https://127.0.0.1:8028/`, the origin is `https://127.0.0.1:8028`. Changing to `http`, changing to `localhost`, or changing the port produces a different origin for these exercises. The hosted frontend serves from the same origin as the API.

## 8.2 Run the synthetic Docker image

Run these commands from the repository root. Docker Desktop users should start its Linux container engine first.

```powershell
docker info
docker build --tag finsight-demo .
docker run --rm --read-only --publish 127.0.0.1:8027:8000 finsight-demo
```

Open [the local container demo](http://127.0.0.1:8027). Keep the terminal open while you use it. Stop the foreground container with `Ctrl+C`.

Here is how to read the commands.

- `docker info` checks the installed client and its connection to the engine. A client binary can exist when the engine is stopped.
- `docker build` reads the [Dockerfile](../../Dockerfile). The dot means the current directory is the build context. [The context allowlist](../../.dockerignore) admits source and named synthetic fixtures while excluding the rest of the worktree.
- The first build stage installs frontend dependencies using the npm lockfile and compiles the synthetic build. The runtime stage installs base Python dependencies, runs the detector during the image build, and copies the frontend artifacts. It runs the server as numeric user and group `10001:10001`.
- The port argument is **host address:host port:container port**. The browser enters through port 8027, and Uvicorn receives the connection on port 8000 inside the container. If 8027 is occupied, change only the middle number and use the new URL. [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)
- `--read-only` applies to the runtime filesystem. `--rm` removes the disposable container on exit. The built image remains available for another run.

From a second terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8027/api/health
Invoke-RestMethod http://127.0.0.1:8027/api/ready
Invoke-RestMethod http://127.0.0.1:8027/api/summary
```

In the synthetic build, the import navigation is hidden and the private and saved-statement routes are disabled. A fresh hosted test therefore requires its own build and database. [Container runtime definition](../../Dockerfile) · [Container test steps](../../.github/workflows/verify.yml)

## 8.3 Understand the hosted pieces

The **database server** is the PostgreSQL process. A **database** is a named collection of stored objects within that server. A **database role** is a PostgreSQL identity with privileges. A **migration** changes the shape of tables and indexes in a controlled sequence.

**SQLAlchemy** builds queries from Python objects. **Psycopg** carries those queries over a connection to PostgreSQL. **Alembic** applies the migration sequence. The `postgresql+psycopg` part of a connection URL selects both the database type and the driver. [SQLAlchemy PostgreSQL dialect](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html)

FinSight has two different HTTPS/TLS connections in a remote environment. Browser-to-app HTTPS protects imports and bearer tokens on the way to the API. App-to-database TLS protects traffic between the API and PostgreSQL. The remote PostgreSQL URL must use `sslmode=verify-full`, which checks the certificate and server identity. A local exercise can use an explicit loopback IP. The migration script reads its URL separately, so use an appropriate verified TLS configuration there too. [PostgreSQL TLS verification](https://www.postgresql.org/docs/current/libpq-ssl.html) · [Runtime validation](../../src/hosted_api.py) · [Migration environment](../../migrations/env.py)

## 8.4 Build a private hosted lab

The following exercise assumes you already have a disposable PostgreSQL database and an HTTPS certificate and key for the loopback endpoint. The [workflow](../../.github/workflows/verify.yml) is a runnable example for automated testing. It provisions a PostgreSQL service, uses a temporary directory, and generates a short-lived lab certificate. For ordinary browser use, use a certificate trusted for the exact hostname you choose. The Playwright harness accepts a disposable test certificate in its own browser context.

In PowerShell, from the repository root:

```powershell
python -m pip install -r requirements-hosted.txt
$lab = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("finsight-hosted-" + [guid]::NewGuid()))
$env:FINSIGHT_PROCESSED_DIR = Join-Path $lab.FullName 'processed'
$env:FINSIGHT_FRONTEND_DIST = Join-Path $lab.FullName 'dist'
$env:VITE_FINSIGHT_HOSTED = 'true'
$env:VITE_API_URL = '/'
npm ci --prefix frontend
npm run build --prefix frontend -- --outDir $env:FINSIGHT_FRONTEND_DIST --emptyOutDir
python -m src.detect_recurring_v3
```

Read the exit output after each command. The build prepares browser assets. Running the detector prepares synthetic API fixtures. A fresh hosted server still uses these for its synthetic views, so do both before startup. Build to a dedicated directory so you can switch back to a normal local build later.

Configure the running server in the same shell or process secret store:

| Variable | What to supply |
| --- | --- |
| `FINSIGHT_DEPLOYMENT_MODE` | `hosted`. Set this for the API process. |
| `FINSIGHT_HOSTED_ORIGIN` | Exact HTTPS origin, such as `https://127.0.0.1:8028`, without a path or trailing slash. |
| `FINSIGHT_HOSTED_DATABASE_URL` | SQLAlchemy URL for the disposable database. A lab URL has the shape `postgresql+psycopg://user:password@127.0.0.1:5432/database`. Special characters in URL credentials must be encoded. |
| `FINSIGHT_HOSTED_ENCRYPTION_KEY` | A distinct 32-byte random key represented as 64 hexadecimal characters. Persist it in a secret store when snapshots must survive restarts. |
| `FINSIGHT_HOSTED_FALLBACK_KEYS` | Optional JSON list of up to three distinct 64-character hexadecimal keys. These keys read old copies. |
| `FINSIGHT_HOSTED_CREDENTIALS` | JSON object mapping lower-case SHA-256 hexadecimal digests of sign-in credentials to owner UUIDs. |
| `CORS_ALLOWED_ORIGINS` | The CI lab sets `none` and uses same-origin requests. Hosted routes additionally enforce the configured HTTPS origin. |

For a lab with the database URL and origin already set, this generates one owner and one sign-in credential without printing the credential or key. `ConvertTo-Json` encodes the credential mapping. `Set-Clipboard` is an optional explicit transfer into the login field on your trusted lab machine. Clear the clipboard afterward if you use it.

```powershell
$env:FINSIGHT_DEPLOYMENT_MODE = 'hosted'
$env:FINSIGHT_HOSTED_ORIGIN = 'https://127.0.0.1:8028'
$env:CORS_ALLOWED_ORIGINS = 'none'
$finsightLabToken = python -c "from secrets import token_urlsafe; print(token_urlsafe(32))"
$env:FINSIGHT_HOSTED_ENCRYPTION_KEY = python -c "from secrets import token_hex; print(token_hex(32))"
$finsightDigestBytes = [Text.Encoding]::ASCII.GetBytes($finsightLabToken)
$finsightDigest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($finsightDigestBytes)).ToLowerInvariant()
$env:FINSIGHT_HOSTED_CREDENTIALS = @{ $finsightDigest = [guid]::NewGuid().ToString() } | ConvertTo-Json -Compress
```

This example uses PowerShell 7. Keep the environment and generated secrets out of source control, screen recordings and copied terminal transcripts. A second test owner needs a different UUID and credential. Two digests mapped to the same UUID deliberately share a workspace.

Run migrations against the intended database. Read the revision before deciding whether to start the server.

```powershell
python -m alembic heads
python -m alembic upgrade head
python -m alembic current
```

| Revision | Change |
| --- | --- |
| `0001_hosted_statements` | Creates encrypted statement storage and expiry indexes. |
| `0002_hosted_sessions` | Adds expiring token digests and the owner and expiry indexes. |
| `0003_hosted_account_history` | Adds optional encrypted history, lineage, version and save time fields. Existing copies remain readable. |

[Migration source](../../migrations/versions)

Point `$finsightLabTlsKey` and `$finsightLabTlsCert` at your lab PEM key and certificate files. Start the HTTPS server:

```powershell
python -m uvicorn src.api:app --host 127.0.0.1 --port 8028 --no-access-log --no-proxy-headers --ssl-keyfile $finsightLabTlsKey --ssl-certfile $finsightLabTlsCert
```

Open the configured origin, choose **Import statement**, and connect in **Hosted workspace** using the generated credential. Import a synthetic CSV, save a named copy, and check restore and deletion. Use a second test owner to verify that saved copies do not appear in their list. Stop the server with `Ctrl+C` and close the temporary terminal. Restart the server after provisioning a new frontend path because the static mount is registered at process startup.

## 8.5 Observe and troubleshoot

| Observation | Meaning | Next check |
| --- | --- | --- |
| `/api/health` responds | The API process answers requests. | Check `/api/ready` for serving readiness. |
| `/api/ready` returns 503 | Required build or synthetic detector files are absent, or hosted database checks fail. | Check the configured artifact paths, PostgreSQL connectivity, and migration revision. |
| Application exits during hosted startup | Configuration validation, connection, or schema checks failed. | Check variable names and formats. Confirm the database URL and HTTPS origin without printing secrets. |
| Hosted request returns 401 | Missing, invalid, expired or revoked token, or wrong token type for that route. | Exchange the operator credential for a session and use that session on statement requests. |
| Hosted request returns 403 | Scheme, host or origin differs from configured HTTPS origin. | Compare URL and server TLS/proxy behavior, including the port. |
| Hosted request returns 404 | Requested mode or saved object is unavailable. | Check the deployment mode and signed-in owner. Expiry and deletion also make copies unavailable. |
| Hosted request returns 409 | Active copy or session quota reached, or version selection is stale. | Refresh and inspect current copies or sessions. |
| Hosted request returns 429 | Current worker limits have been reached. | Honor the `Retry-After` header. |
| Browser displays the demo UI on the hosted origin | The served frontend may have been built for a different mode. | Rebuild with `VITE_FINSIGHT_HOSTED=true`, then restart with the intended artifact directory. |

**Liveness** asks whether a process can answer. **Readiness** asks whether it should receive work. The readiness implementation checks the frontend index, bundled transactions and processed synthetic artifacts. In hosted mode it also probes both hosted tables. Liveness can stay up during a database outage. [API implementation](../../src/api.py)

In hosted mode, the application schedules retention work at startup and roughly every 15 minutes. Snapshot cleanup reports aggregate counts and full batches. Session cleanup emits a warning on database errors. Repeated full batches or failures deserve investigation. Counters and gateway alerts still need operator configuration. See [Security and privacy](09-security-privacy.md) for data that belongs outside logs.

## 8.6 Change, back up and restore the service

Before an upgrade, record the app revision, database revision, intended database and frontend build mode. Rehearse the upgrade in a disposable database. Keep migrations under a controlled identity and deploy a consistent version across workers. The repository test lab verifies functionality with its service role. A production split between migrator and restricted runtime identities remains a release gate.

When rotating the write key, first deploy a keyring configuration in which every worker can read both keys and the old key still writes. Then promote the new key to primary everywhere and keep the old one as fallback. Verify reads of copies made before and after the change. Preserve both readable keys through a rollback. Active copies can last up to 90 days after the last old-key write. Account for restorable backups, replicas and archives before retiring a key. Existing rows keep their original encryption.

A **restore** brings saved database state back. **Point-in-time recovery** can replay the write-ahead log (WAL) to a chosen time. An older restore can reintroduce revoked sessions and snapshots deleted after that point. Rehearse on an isolated database, remove restored session rows before admitting traffic, and reconcile deletions against a separately maintained record or recovery process. The current project documents these duties and does not automate the reconciliation. [PostgreSQL backup and WAL recovery](https://www.postgresql.org/docs/current/continuous-archiving.html)

Recovery drill checklist:

1. Pick a synthetic source and disposable target. Record the expected active, expired and explicitly deleted snapshot IDs without recording payloads or keys.
2. Restore into the target in isolation. Apply migrations if needed and supply the authorized read keys separately.
3. Invalidate restored sessions before starting the browser checks. Re-authenticate a test owner and confirm a different owner cannot load the copy.
4. Verify current expiry filtering, active data recovery and the deletion reconciliation procedure. Separately test archive retention and removal according to the environment's backup policy.
5. Keep a report with version identifiers, outcomes, and failures. Avoid copying the dataset, database URL, bearer values or encryption keys into the report.

The implementation log records a successful encrypted logical row recovery drill on disposable PostgreSQL. It does not demonstrate a managed backup service, a public ingress configuration or scheduled backup reconciliation. [Verification history](../engineering/implementation-log.md) · [Release gates](../engineering/feature-roadmap.md)

## 8.7 Read the CI workflow as a lab recipe

CI means **continuous integration**, a service that runs checks on code changes. The workflow declares separate jobs. The base job builds the frontend, generates synthetic detector artifacts, checks Python, lint and frontend tests, and exercises local import, calendar and synthetic image browser paths. The hosted job adds PostgreSQL 17, installs hosted dependencies, applies migrations, and runs HTTPS browser scenarios for sessions, minimized import and account history. The separate disposable PostgreSQL 18.6 test is evidence from the implementation log. A workflow file is a recipe and a run log is execution evidence. [Workflow](../../.github/workflows/verify.yml) · [Recorded evidence](../engineering/implementation-log.md)
