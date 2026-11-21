# ArgosX remediation

Baseline reported by Member 2 on November 21, 2026. VibeScore **81/100**. One public page was scanned. Signed-in behavior was outside scope. No new scan or deployed verification is recorded here. Preserve the original PDF in the team’s external submission storage. No baseline PDF was located in the repository’s documentation, reference, or artifact folders.

| ID | Finding | Owner | Proposed fix | Status and evidence |
| --- | --- | --- | --- | --- |
| a46274 | Missing HSTS | Deployment / Member 1 | Confirm HTTPS and HTTP redirect at the edge. Roll out HSTS with a short max-age first, then raise it after staging verification. Add subdomains only when all are HTTPS-ready. | Pending. Verify response headers on the final HTTPS origin. |
| 483e37 | Public transactions | Member 1 | Confirm the public synthetic access model for `GET /api/transactions`. Keep private datasets behind owner-scoped authorization. | Pending access-model decision. Local demo serves synthetic data. Verify deployed payload and private-route isolation. |
| 344648 | Public commitments | Member 1 | Apply the same data-scope decision to `GET /api/commitments`. | Pending. Verify deployed records and signed-in isolation separately. |
| 35145c | Public alerts | Member 1 | Apply the same data-scope decision to `GET /api/alerts`. | Pending. Verify deployed demo alerts derive from synthetic fixtures. |
| d018be | Missing CSP | Deployment / Members 1 and 2 | Start with Content-Security-Policy-Report-Only. Account for Google Fonts, the index preload handler, same-origin API, and runtime styles or assets. Rehearse login, import, charts, and assistant before enforcing. | Recommendation only. No policy deployed. |
| d2392a | Missing Permissions-Policy | Deployment / Member 1 | Test a restrictive baseline such as `camera=(), microphone=(), geolocation=(), payment=()` at the edge. | Recommendation only. Verify headers and browser flows on staging. |
| abdee0 | Missing Open Graph | Member 2 | Ship OG title, description, and type from `frontend/index.html`. Add a dedicated preview image if a suitable approved public asset becomes available. | Implemented locally. Deploy and inspect the served HTML. Existing icon assets are unsuitable for a social preview. |
| 807944 | Missing canonical | Member 2 / Deployment | Set `FINSIGHT_PUBLIC_ORIGIN` to the approved HTTPS public homepage origin during the frontend build. | Implemented in build configuration. Verify the deployed root link. |
| f28d75 | Missing robots.txt | Member 2 / Deployment | Serve the generated file. Unconfigured builds disallow crawling. Public builds exclude API and API-documentation paths. | Implemented in build configuration. Verify deployed content and status. Robots directives provide crawler guidance only. |
| 6f31c6 | Missing sitemap.xml | Member 2 / Deployment | Generate a root-only sitemap when public indexing is approved. The app uses in-page navigation. | Implemented conditionally. Verify the deployed XML and its single public URL. |

After deploy, inspect the raw HTML, response headers, sitemap and robots files on the final origin. Confirm the synthetic/private access boundary with Member 1. Then rerun ArgosX on that URL and record the date, scope, score and findings alongside the baseline. Check signed-in paths separately with authorization.

Local evidence on November 21: a production build with an example HTTPS origin emitted the canonical link, Open Graph title and description, robots.txt, and a root-only sitemap.xml. The local launcher without a public origin served robots.txt with a crawl block, emitted a noindex marker, and returned 404 for sitemap.xml.
