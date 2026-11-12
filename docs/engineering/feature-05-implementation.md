# Feature 5 implementation report

The commitment details dialog now includes a persistent, payment-specific revocation checklist. The commitments ledger reflects progress and shows **Marked as revoked (user-reported)** after an explicit report. FinSight records the report locally. The payment provider remains the source for official confirmation.

## Changes

- `frontend/src/App.tsx` wires guidance, checklist state, and live ledger badges into the existing dialog and tables. The existing review flags remain visible alongside progress.
- `frontend/src/components/RevocationTracker.tsx` provides native checkboxes, keyboard-operable step accordions, a live step count, an accessible progress bar, and a confirmed reset. The next incomplete step opens when a step is checked. Checking every step displays **Checklist complete** and enables the separate report action for mandate guides. Unchecking a step clears the report.
- `frontend/src/components/revocationGuide.ts` uses the existing cancellation guidance and adapts it for a single revocation workflow. Card and NACH routes are presented as alternatives through the issuer or bank. Manual UPI and unknown methods have investigation checklists. No backend endpoint or API response schema changed.
- `frontend/src/App.css` uses the existing paper, ink, evergreen, and amber tokens for progress, checkbox feedback, step expansion, and responsive layouts.

The original visual spec proposed regulatory insignia and legal claims. The app uses a FinSight monogram and practical provider instructions. NPCI's circular describes UPI AutoPay revocation and authentication. The RBI's 2026 e-mandate directions address issuer-side withdrawal, while RBI/2024-25/64 addresses FASTag and NCMC auto-replenishment. The tracker omits legal guarantees, deadlines, and regulatory badges. [NPCI OC-223](https://www.npci.org.in/uploads/UPI_OC_No_223_FY_2025_26_Enhancement_of_UPI_Autopay_88b38535cb.pdf), [RBI 2026 e-mandate directions](https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13374), [RBI/2024-25/64](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12722).

## Animation and 3D

GSAP sequences the dialog entrance, tracker header, step reveal, progress meter, and report stamp. CSS handles checkbox compression, checkmark drawing, accordion height, and meter fill. The lazy-loaded React Three Fiber emblem uses procedural geometry and demand rendering. Pointer movement tilts it. A fresh report triggers one rotation and a radial pulse. Reduced motion, unavailable WebGL2, and WebGL context loss use a static FinSight monogram. Reduced motion suppresses the GSAP sequences and disables or shortens CSS motion.

The lockfile resolves `gsap@3.15.1`, `@gsap/react@2.1.2`, `@react-three/fiber@9.8.2`, `three@0.187.0`, and dev dependency `@types/three@0.187.0`. The installed dependency tree deduplicates to React and React DOM 19.3.1. The procedural scene uses no Drei dependency.

## Persistence

Browser localStorage key `finsight_mandate_revocations_v1` stores commitment IDs, checked indices, step counts, timestamps, and explicit report state. The tracker preserves valid legacy indices and downgrades legacy automatically assigned reports to checklist progress. A count change invalidates a saved report. Reset clears the selected commitment only. If storage is unavailable, the session continues in memory and the tracker displays a warning. No credentials or bank reference numbers are collected.

## Verification

- `npm run build -- --outDir <temporary directory>` exited 0. The separate Three/R3F bundle measured 922.57 kB minified and 244.03 kB gzip. Vite reported its large chunk warning. The build used a temporary directory to preserve the working tree's existing dist files.
- `npm run lint` exited 0. The Node test runner passed all six guidance and storage tests.
- Playwright with installed Chrome and the repository's Node demo API verified the desktop workflow at 1440 px and the dialog at 375 px. Checks covered Space on checkboxes, Enter on accordions, Escape and focus restoration, live ledger updates, isolation between commitments, persistence after refresh, explicit reporting, and canceling and confirming a reset. The mobile check found no horizontal dialog overflow and verified the reduced-motion fallback. A separate Chrome launch with WebGL disabled showed the static emblem and a working checklist. The WebGL-enabled run mounted the canvas and exercised pointer input.
- The Python suite could not start because the workspace virtual environment points to a missing Python executable. Chrome emitted a Three.js Clock deprecation warning. npm install reported ten moderate audit findings across the dependency tree. Frame rate, physical devices, other browsers, and screen-reader output were outside the measured coverage.

Progress is browser- and origin-specific. It does not sync between devices or tabs in real time. The API supplies steps as text, so index-based progress cannot detect same-length rewrites to guidance.

## Demo

1. Run `node src/server.js` from the repository root to start the demo API on port 8000, or use the existing FastAPI backend.
2. Run `npm ci` and `npm run dev` from `frontend`. Open the Vite URL.
3. Open **Recurring payments** and select a UPI AutoPay commitment. Check two steps, close the dialog, and show the ledger badge. Refresh and reopen the same commitment, then open a different commitment to show progress isolation.
4. Finish the checklist and show **Checklist complete**. For synthetic demo data, select **Mark as revoked** to play the emblem and stamp sequence, then show the user-reported badge in the ledger.
5. Reopen the commitment and confirm **Reset checklist** to prepare it for another run.
