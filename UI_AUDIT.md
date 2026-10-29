# FinSight frontend audit â€” before redesign

Reviewed 2026-10-28 against the four page states in `frontend/src/App.tsx` and the supplied market-dashboard reference at `refrences/278f1436abe3243dfc115435ce5d5dbc.png`. The app uses React 19, Vite, custom CSS, Lucide icons, and Recharts. Screenshots use the running API and its synthetic dataset.

## Baseline screenshots

- [Overview at 375px](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/before/overview-375.png)
- [Overview at 768px](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/before/overview-768.png)
- [Overview at 1440px](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/before/overview-1440.png)
- [Recurring payments at 1440px](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/before/recurring-1440.png)
- [Transactions at 1440px](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/before/transactions-1440.png)
- [Evaluation & audit at 1440px](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/before/evaluation-1440.png)

## Current UI audit against the no-AI-tells brief

This review records the dark/mint interface before the approved paper-and-evergreen direction was implemented.

- **Generic dark fintech palette, competing accents, and effects:** found in `frontend/src/App.css:1-19, 139-150, 179-185`; mint, amber, coral, blue, purple, and orange roles compete, and the first KPI has a mint gradient. The sticky topbar uses backdrop blur. No purple-pink hero gradient, glowing blobs, gradient border, or pure black/white were found.
- **Compressed type and tiny uppercase labels:** found in `frontend/src/App.css:161-165` and `frontend/src/App.tsx:316, 320`. The largest page heading is 31px against 13px body text; many supporting details fall to 9–12px. Existing Plus Jakarta Sans and JetBrains Mono are stronger than generic system-only typography, but there is no display face.
- **Repeated KPI cards and panel stacking:** found in `frontend/src/App.tsx:439-600, 604-723, 725-807`. Four same-treatment metric cards with icon tiles precede a chart panel, queue panel, and table panel. The first metric uses decoration instead of a stronger content hierarchy.
- **Fabricated chart:** found in `frontend/src/App.tsx:198-206, 471-523`. Six month values are generated from hand-picked multipliers of the annual estimate. The chart says “illustrative,” but still looks like observed history.
- **Icon tiles and placeholder initials:** found in `frontend/src/App.tsx:316, 353, 380, 439-466, 933, 1000` and `frontend/src/App.css:182-185, 244, 281-282`. Lucide is consistent and there are no emoji or mixed icon sets. Many icons sit in tinted boxes; “FS” is shown as an avatar despite there being no real user profile.
- **Copy:** partly found in `frontend/src/App.tsx:387-405, 530-533, 729-732, 976-979`. The main heading and synthetic-data disclosures are specific. Generic repeated subheads, implementation-facing empty-state instructions, and “Ground Truth Contract” jargon should be rewritten. No hype phrases, fake testimonials, or invented customer logo wall were found.
- **Token drift:** found in `frontend/src/App.css:1-25` and throughout the component rules. Variables exist, but hard-coded colors remain outside them; spacing ranges from 4px to 22px without a consistent 4/8 rhythm, and literal corner radii add several values beyond the four radius tokens. No default shadcn/Tailwind component styles are present.
- **States and navigation:** mostly present, but uneven. Focus, loading, error/retry, disabled refresh, empty state, keyboard modal, and reduced motion exist (`App.css:50-53, 251-291, 394-396`; `App.tsx:418-435, 961-979`). Mobile nav becomes a horizontal scroller and hides the fourth item offscreen at first glance (`App.css:331-350`). No custom not-found screen exists; the FastAPI SPA fallback serves the app shell for unknown paths.
- **Layout tells not found:** no centered “Welcome to X” hero, giant dual-CTA hero, universal 3-column marketing grid, card-on-card stack, or oversized uniform shadows. There is one dialog shadow; avoid adding panel shadows.

## Screen scores

| Screen | Hierarchy | Consistency | Polish | Originality | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Overview | 6 | 5 | 4 | 4 | Metrics and review queue are easy to locate, but four equal KPI cards and two large equal-weight panels flatten priority; chart panel consumes excess vertical space. |
| Recurring payments | 5 | 5 | 4 | 3 | Useful table and search, but the dark panel/table treatment feels like a generic admin kit and row evidence is visually underplayed. |
| Transactions | 5 | 5 | 4 | 3 | Ledger structure is familiar; tight text, long raw descriptions, and review flags compete for attention. |
| Evaluation & audit | 5 | 5 | 4 | 3 | Metrics are prominent but benchmark interpretation and error breakdown lack a distinct visual narrative. |

Scores are design judgments, not automated accessibility or usability measurements.

## Original baseline tells (before the first redesign)

1. **Glow gradients and accent sprawl:** radial cyan/indigo backgrounds, gradient logo/button and gradients on labels; cyan, blue, purple, green, and amber all act as accent families (`frontend/src/App.css:68-69, 98, 110, 407, 470-488`).
2. **One family carries nearly every role:** Plus Jakarta Sans is used throughout; JetBrains Mono appears only for some numeric cells. Size and contrast hierarchy are weak for secondary metadata, with 9â€“12px labels (`frontend/src/App.css:2-3, 116, 128, 496`).
3. **No emoji icons or mixed icon sets:** icon usage is consistently Lucide; this is a strength, keep it.
4. **Repeated card treatment:** metrics and panels share rounded borders, dark fills, and shadows; most dashboard content is split into repeated boxed regions (`frontend/src/App.css:422-434, 526-528`). The responsive overview becomes a long stack of boxes.
5. **Generic hero copy/structure:** the heading â€œYour money, made visible.â€ and all-caps eyebrow are polished but generic; â€œFind repeating charges hiding in transaction historyâ€ is clearer but could lead with the specific insight (`frontend/src/App.tsx:296-316`).
6. **Radii and shadows lack hierarchy:** panel, metric, button, modal, and row groups use a broad range of unrelated radii; card shadows are repeated while decorative accent glows add further depth cues (`frontend/src/App.css:97, 146, 433-434, 526-528, 852-853`).
7. **Some interaction states exist; key ones are missing:** hover/disabled states and loading/error/empty messages exist. There is no global `:focus-visible` treatment, search inputs remove outlines without replacement, the modal has no visible evidence of focus trapping/return, and table rows are pointer-driven rather than keyboard-operable (`frontend/src/App.css:780-787`; `frontend/src/App.tsx:543-546, 923-929`).
8. **Contrast and mobile density need attention:** quiet text is `#64748b` on dark panels; several hints and captions are difficult to read. At 375px, the sidebar consumes the first viewport and the four metrics and long alert cards produce a very tall page; table columns compress heavily (`frontend/src/App.css:20-21, 75-84, 1074-1113`; screenshots above). Verify computed color pairs before claiming a WCAG result.
9. **Loading motion is a repeating pulse:** one pulsing dot is appropriate as feedback, but there is no reduced-motion override (`frontend/src/App.css:1060-1070`).
10. **Stock aesthetic is partially present:** custom CSS rather than shadcn defaults is in use, but the cyan/blue finance-dashboard palette, equal KPI cards, and card shadows remain familiar template patterns. The product's bespoke evidence and uncertainty language are a better differentiator than extra decorative gloss.

## Product-specific interpretation

This is an analysis dashboard rather than a conversion landing page. A sales hero, testimonial social proof, or signup CTA would be out of place. Preserve a single utility action per view, and make observed data, estimates, and detector inferences visually distinct.

## Ranked skills and guidance shortlist

Stars are GitHub repository stars at review time (2026-10-28), not skill-specific installs. Last-updated dates are shown when the source exposes them; otherwise noted as unavailable.

| Rank | Candidate and source | What it adds / recency / adoption | Fit and decision |
| --- | --- | --- | --- |
| 1 | [Anthropic `frontend-design`](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Visual direction, typography, responsive design, reduced motion, and screenshot critique; repo about 184.5k stars; skill file has no date metadata. | Excellent fit for a React dashboard. Already present in Codex at `C:\Users\Swee2\.agents\skills\frontend-design`; read both package files (`SKILL.md`, `LICENSE.txt`), no scripts or credential/network behavior. Confirmed it loads. No new copy needed. |
| 2 | [Vercel `web-interface-guidelines`](https://github.com/vercel-labs/web-interface-guidelines) | Cross-framework rules for keyboard/focus, targets, loading, forms, responsive behavior; about 1.1k stars; repo active in 2026. | Excellent review reference. Not installed as an agent skill because its companion Vercel skill fetches mutable `main` instructions at runtime; that cannot meet your pinning/safety rule. |
| 3 | [Vercel `react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | React performance rules across fetching, bundles, render behavior; parent repo about 33.1k stars; v1.0.0, current date metadata absent. | React fits; Next-only rules are less useful to this Vite app. Candidate for later targeted performance work, not installed in this visual pass. |
| 4 | [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction) | Unstyled accessible primitives for keyboard and focus behavior; repo about 19.4k stars; actively updated Oct 2026. | React-compatible, but adopting it adds dependencies and is unnecessary for the current CSS-only redesign. Official docs are useful guidance; no install. |
| 5 | [shadcn/ui](https://ui.shadcn.com/docs) | Copyable React components, theming, skeletons, empty states and data table patterns; repo about 126.5k stars; active in 2026. | Strong React fit but not used in this app. Installing would introduce the stock component aesthetic and a dependency/workflow change; skip. |
| 6 | [Tailwind CSS v4 theme docs](https://tailwindcss.com/docs/theme) | CSS-first design tokens and states; current docs are v4.3. | Tailwind v4 exists in dependencies, but the UI intentionally uses custom CSS and does not import it. Use concepts only; no config migration. |
| 7 | [Motion accessibility guide](https://motion.dev/docs/react-accessibility) | Reduced-motion handling and accessible animation choices; docs available as of Oct 2026. | Relevant principles, but Motion is not installed and this dashboard needs only small CSS transitions. No dependency added. |

The Vercel UI skill was also inspected: its documented workflow fetches a mutable remote rules file on each use. That runtime network dependency is specifically excluded by your safety/pinning criteria. No unvetted community skills, shell scripts, or dependency installs were used.

## Reference research

The supplied CXP market view gives a visual precedent for compact top-level indicators, chart-led panels, left navigation, and restrained red/green market movement. Apply its density and panel hierarchy, while replacing trading terminology and color semantics with subscription evidence.

Official product descriptions show useful recurring-payment patterns: Rocket Money groups recurring items and separates upcoming/inactive items; Monarch documents a recurring calendar and searchable/groupable merchant list; Copilot provides list/grid modes and editable filters; Paylert advertises India-specific UPI AutoPay and bank mandate coverage. Adopt the list, status, filtering, and payment-route clarity. Do not imply FinSight has live bank sync, upcoming reminders, or automated cancellation. Sources: [Rocket Money](https://help.rocketmoney.com/en/articles/2185531-managing-your-bills-and-subscriptions), [Monarch](https://www.monarch.com/blog/track-recurring-bills-and-subscriptions), [Copilot](https://help.copilot.money/en/articles/9778259-recurrings-tab-overview), [Paylert](https://play.google.com/store/apps/details?id=com.nishkamaapps.paylert).

Typography, color, and spacing direction in `DESIGN.md` are design recommendations for this product, not claims about competitors' underlying token systems. WCAG 2.2 requires at least 4.5:1 for ordinary text and 3:1 for large text; keyboard operation needs a visible focus indicator. Motion preferences should be respected with `prefers-reduced-motion`. Sources: [W3C contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).

## After implementation

The approved warm editorial-ledger design now uses the tokens in `DESIGN.md`. The overview leads with one estimated monthly figure and actual detected patterns; the fabricated trend chart, four equal KPI cards, icon tiles, placeholder profile initials, technical empty copy, and duplicated refresh button are gone. Tables become labelled evidence rows on mobile. Routes, detector logic, API endpoints, and fetch behavior are unchanged. Unknown client paths show a designed not-found screen. No package dependency was added.

| Screen | Hierarchy | Consistency | Polish | Originality | Change |
| --- | ---: | ---: | ---: | ---: | --- |
| Overview | 9 | 9 | 9 | 8 | One monthly estimate anchors the page; real pattern rows and review evidence replace the invented trend and equal card row. |
| Recurring payments | 9 | 9 | 8 | 8 | Search and a compact labelled evidence table lead, with confidence and review status easy to scan. |
| Transactions | 8 | 9 | 8 | 7 | The complete synthetic ledger stays dense on desktop and becomes labelled rows on mobile. |
| Evaluation & audit | 8 | 9 | 8 | 7 | Benchmark metrics and error counts use the shared ledger hierarchy and sentence-case copy. |

After screenshots: [Overview 375px](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/after/overview-375.png), [768px](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/after/overview-768.png), [1440px](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/after/overview-1440.png), [Recurring payments](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/after/recurring-1440.png), [Transactions](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/after/transactions-1440.png), and [Evaluation & audit](/D:/Projects/Fintech-Recurring-Intelligence/artifacts/screenshots/after/evaluation-1440.png).

## Verification

- Production build: passed. Vite output: 245.16 kB JavaScript (75.85 kB gzip) and 24.11 kB CSS (4.79 kB gzip). The unused charting library is absent from the rendered bundle; no package dependencies were added.
- FastAPI static serving: `http://127.0.0.1:8000` returned HTTP 200 and the rebuilt FinSight document/bundles.
- ESLint: passed.
- Browser geometry on all four screens at 375px and 768px, and on the overview at 1440px: document width matched viewport width. Detail dialog measured 343px within the 375px viewport.
- Keyboard: skip link receives first Tab focus; detail dialog receives initial focus, traps Tab, closes with Escape, and returns focus to the opener.
- Reduced motion: `prefers-reduced-motion: reduce` is honored.
- Contrast calculated for the final tokens: ink/paper 13.55:1, supporting text/paper 6.70:1, quiet text/paper 5.32:1, evergreen/paper 7.84:1, and attention/attention wash 5.51:1. Each text pair meets WCAG AA.
- Lighthouse after the editorial redesign (FastAPI at http://127.0.0.1:8000, desktop profile): Performance 99, Accessibility 100, with no failed accessibility audits. FCP 0.9 s, LCP 0.9 s, Speed Index 1.0 s, TBT 110 ms, TTI 2.5 s. Lighthouse still reports opportunities for unused JS/CSS and about 310 ms of render-blocking stylesheet time; accessibility remains clean.
- Static caching remains verified: hashed Vite assets return public, max-age=31536000, immutable; HTML returns no-cache. The Google Fonts stylesheet loads asynchronously with immediate system fallbacks.
