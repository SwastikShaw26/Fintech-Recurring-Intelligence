# FinSight Feature 3 independent audit

**Executive verdict — PARTIAL**  
**Recommendation — ACCEPT WITH FIXES**

The Feature 3 commit implements a default browser origin allowlist, three response headers, bounded parameters on two routes, and source-level frontend cleanup. That is meaningful work for a small patch. The implementation report overstates the scope of the validation changes, the evidence for injection remediation, the completeness of dependency cleanup, and the extent of backend verification. The production bundle was byte-identical in the controlled comparison.

## What changed

Compared `ebfb126b103a2d1c92adffefb1195a1a0b2450a1` with its parent `c9afe9b`. The working tree was clean at audit start. Ignored local dependencies were inspected as environment evidence.

| Category | Evidence |
|---|---|
| API code | 31 insertions, 7 deletions. Added environment parsing and tightened CORS in [src/api.py](../../src/api.py#L33), extended existing cache middleware at [line 55](../../src/api.py#L55), and added path bounds and a merchant query limit at [lines 480](../../src/api.py#L480) and [505](../../src/api.py#L505). |
| Tests | 29 inserted lines in [tests/test_api.py](../../tests/test_api.py#L110), comprising three HTTP TestClient tests and whitespace. |
| Manifest | One insertion and four deletions in [frontend/package.json](../../frontend/package.json#L12). Three direct dependencies dropped. |
| Build configuration | One insertion and two deletions in [frontend/vite.config.ts](../../frontend/vite.config.ts#L2). Tailwind's active Vite plugin was removed. |
| Assets | Deleted `frontend/src/assets/hero.png` (13,057 bytes), `react.svg` (4,126), and `vite.svg` (8,709). Sizes come from parent Git blobs. |
| Lockfile and shipped files | No change to [frontend/package-lock.json](../../frontend/package-lock.json#L10) or tracked `frontend/dist`. |
| Documentation | 144 inserted lines in [the implementation report](feature-03-implementation.md). |

## Claim-by-claim verification

VERIFIED means the evidence directly supports the claim at the stated scope. PARTIALLY VERIFIED means the implementation exists with a qualification or missing execution. UNVERIFIED means evidence is insufficient. FALSE means the evidence contradicts the claim.

| Report claim | Classification | Independent evidence |
|---|---|---|
| Four default origins replace the credentialed wildcard | PARTIALLY VERIFIED | The API supplies the four exact loopback origins to Starlette. The installed middleware source confirms exact origin matching. Runtime confirmation is outstanding. |
| Configurable strict origins, restricted methods and request headers | PARTIALLY VERIFIED | The comma-separated override replaces defaults, trims whitespace and is read at import. Configured methods are GET, POST and OPTIONS. Configured headers are Content-Type, Authorization and Accept plus framework-safelisted headers. Installed Starlette source checks requested method and headers on preflight (cors.py:102–145). The parser also accepts a literal wildcard, and empty and whitespace-only values behave differently. OPTIONS permission alone does not create a route. |
| Origin exposure eliminated and critical vulnerabilities resolved | FALSE | CORS governs browser cross-origin response access. Direct callers and ordinary requests still reach the handlers, and the API has no corresponding authentication boundary. The prior broad browser policy was real. The report supplies no evidence for a critical severity rating in a local synthetic-data demo. |
| Three defensive headers added | PARTIALLY VERIFIED | The outer application middleware assigns all three values to responses returned by downstream handlers, including mounted assets and SPA HTML. `nosniff` limits MIME sniffing, `DENY` blocks framing, and the referrer policy sends full same-origin referrers and origin-only referrers on non-downgrade cross-origin requests. End-to-end coverage remains open, including unhandled 500 responses. |
| Cache differentiation added | FALSE | Both cache rules existed in the parent. HTML uses `no-cache`, which permits storage with revalidation. The asset rule keys off the URL prefix. |
| New strict validation on four routes | FALSE | The transaction and commitments collection constraints are unchanged from the parent ([api.py](../../src/api.py#L402)). Two detail routes gained validation. |
| Detail parameters bounded and malformed values return 422 | PARTIALLY VERIFIED | Both path arguments declare length 1–50 and character patterns. The merchant query has a 100-character maximum. The route wiring is present. Full FastAPI execution was unavailable, and there is no added cancellation-route boundary test. |
| SQL/script injection prevented | FALSE | The cited lookup compares strings over CSV-derived records. Cancellation guidance normalizes the method and selects a dictionary, then returns the merchant as JSON data ([cancellation_guide.py](../../src/cancellation_guide.py#L87)). No SQL or executable HTML sink was identified along those paths. Character and length bounds constrain input shape. |
| Three unused frontend dependencies and three assets removed | PARTIALLY VERIFIED | All three declarations and unused assets were removed. Parent source had no app imports or references to these items. Tailwind was active as a build plugin, which was removed. The lockfile and existing installation retain all three packages. The reported `vite.svg` size is one byte high. |
| Roughly 20 MB of installed dependency bloat removed | UNVERIFIED | The report has no controlled installed-size measurement. The existing dependency tree still contains the packages as extraneous. |
| Production bundle optimized through pruning | FALSE | Both configurations emitted the same five files with identical SHA-256 digests. JavaScript remained 245,163 bytes and CSS 24,113 bytes. |
| Frontend builds and lints cleanly | VERIFIED | Independent build and lint each exited 0 using existing modules. Build output matches the reported filenames and sizes. The report's historical 500 ms runtime is run-specific. |
| Three tests added and they pass | PARTIALLY VERIFIED | Added tests perform actual HTTP requests and inspect status or headers. The direction assertion covers pre-existing behavior. The historical backend pass claim is UNVERIFIED because the report contains no pytest transcript and discloses a broken environment. This audit could not start pytest. |
| Static checks confirm the hardening and cleanup | PARTIALLY VERIFIED | Source and manifest checks corroborate the default configuration, header assignments and manifest pruning. These checks cannot establish HTTP behavior or installed dependency cleanup. |
| Named subagent independently approved the final state | UNVERIFIED | The report provides a name and ID with summarized conclusions. The reviewed revision, raw execution evidence and review record were unavailable in the audited artifacts. |
| Feature fully verified and the repository ready for subsequent roadmap features | FALSE | The lockfile is inconsistent, FastAPI verification is outstanding, and the report's production optimization and injection claims exceed the demonstrated changes. |

## Independent execution

| Command or check | Exit and observed result |
|---|---|
| `git status --short`, `git diff HEAD^ HEAD --numstat`, `git show HEAD` and targeted Git searches | 0 for status and diff. Clean at entry and eight changed files. No parent application imports of the removed assets or libraries. |
| `git diff --check HEAD^ HEAD` | 2. Existing Feature 3 report trailing whitespace and final blank lines in the report and API tests. |
| `.\.venv\Scripts\python.exe -B -m pytest -q -p no:cacheprovider` | 103. **NOT RUN.** `did not find executable at 'C:\Python314\python.exe': The system cannot find the path specified.` |
| Same pytest invocation with `tests/test_api.py` appended | 103. **NOT RUN.** Same launcher failure. No test collected or executed. |
| Bundled Python 3.12.14 import checks with the existing venv's site-packages on the import path | 1 for isolated import probes. pytest and httpx unavailable. FastAPI import failed with `ImportError: cannot import name 'ArgsKwargs' from 'pydantic_core._pydantic_core' (unknown location)`. No installation or environment repair performed. |
| `npm.cmd run lint` from frontend | 0. `> eslint .` with no diagnostics. |
| `npm.cmd run build -- --outDir <fresh temp directory>` from frontend | 0. Vite 8.3.5 transformed 1,934 modules. JS 245.16 kB / 75.85 kB gzip, CSS 24.11 kB / 4.79 kB gzip. `✓ built in 10.49s`. Tracked dist was preserved. |
| `npm.cmd ls --all --depth=0` and `node -e` manifest-to-lock root comparison | Both 0 as diagnostic commands. npm printed all three removed packages as extraneous. Both root dependency-map comparisons returned false. Clean install was **NOT RUN** to preserve existing dependencies and honor the no-install constraint. |
| `node --input-type=module -e` with two Vite `build()` calls and SHA-256 on emitted files | 0. Same input tree and installed versions, `configFile:false`, parent plugins `[react(), tailwindcss()]` versus current `[react()]`, each written to a fresh temporary directory. Parent Git source search confirms the three deleted assets were unused and no other frontend build inputs changed. All five output hashes matched. JS SHA-256 `dcfccb42c06819773a9445782632fdea0dfcd5d1afb2d25d3752d573b4160a2d`. An earlier attempt emitted the parent-config bundle but exited 1 when reading Vite's programmatic return value. The successful comparison read emitted files directly. |
| Isolated Starlette preflight and middleware function probes | **NOT RUN to completion.** The bundled-interpreter probes did not return a result or an exit code during verification. No runtime result credited. |
| Full API HTTP checks and live browser integration | **NOT RUN.** The backend could not be imported or launched in the available environment. |

## Findings by severity

1. **Medium, reproducibility.** The manifest and lockfile disagree, and the successful build used an existing tree with the supposedly removed packages. Regenerate the lockfile with the approved toolchain and verify a clean install, build and lint before sign-off.
2. **Medium, verification gap.** The repository cannot currently execute its backend tests in this environment. The three added tests cover health headers, simple CORS origin behavior, and two 422 assertions. The test file lacks preflight and override checks, static and error response headers, and negative cancellation-route and merchant bounds. Existing positive tests cover a generated commitment ID, an unknown well-formed ID returning 404, and an encoded UPI AutoPay label.
3. **Low for a loopback synthetic demo, configuration.** The override accepts wildcard configuration alongside credentials. Allowing Authorization in preflight does not implement authorization. The current loopback list matches the usual dev and API ports. Hosted or preview origins need deliberate configuration if cross-origin access is required. Confirm the demo binds locally and uses synthetic data.
4. **Low, API compatibility.** Generated commitment IDs already fit the new format ([api.py](../../src/api.py#L120)). The cancellation endpoint can now reject punctuation, Unicode or long labels that previously selected guidance or returned the fallback. Its pattern still accepts percent signs and whitespace, so it does not enforce a fixed vocabulary. The dashboard gets embedded guidance from the commitments list and renders text ([App.tsx](../../frontend/src/App.tsx#L732)). That UI path bypasses the changed standalone guide endpoint. Confirm which labels the standalone route promises to accept.

## Minimum work before sign-off

1. Align the lockfile and run a clean frontend install, build and lint.
2. Run the full backend and API suites using a working interpreter and the declared dependencies. Add targeted integration assertions for preflight and override behavior, SPA and asset headers, valid and over-limit guide inputs, and handled errors. Smoke-test the dashboard against the synthetic dataset.
3. Define the override's wildcard and empty-value behavior. Enforce explicit origins if strict allowlisting is the supported contract. Confirm existing valid labels still work.
4. Correct the implementation report to describe two changed route contracts, unchanged cache behavior and shipped bundle, and the backend evidence actually available.

## Decision

**Did Antigravity genuinely implement Feature 3?** Yes. The attributed implementation is present in the commit, with incomplete dependency cleanup and verification. Git records the code and commit author. It cannot independently identify who authored each edit.

**Does the work match the claims?** It matches the core code changes. The strongest claims about injection prevention, shipped bundle reduction, complete cleanup and backend passes exceed the evidence. The 38 changed API lines are enough to implement meaningful middleware and validation changes.

**Which protections work?** Source inspection establishes the configured preflight policy, the three header assignments and the two validation contracts. Their HTTP behavior remains unverified. The frontend build, lint and bundle comparison were verified by execution.

**Is it sufficient for a credible hackathon demo?** The design is proportionate for a local synthetic-data demo. Demo readiness remains conditional on a runnable backend, a clean dependency install, and an integrated smoke test.

**Should development proceed to Feature 5?** Hold Feature 3 sign-off and progression to Feature 5 until the minimum verification and dependency fixes are complete. Feature 5 itself was outside this audit's scope.
