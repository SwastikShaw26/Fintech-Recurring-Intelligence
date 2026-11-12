# Feature 5: Interactive Mandate Revocation Checklist & Status Tracker
## Cinematic UI, Motion Choreography & 3D Depth Specification

**Document**: `docs/engineering/feature-05-visual-design.md`  
**Target Feature**: Feature 5 — Interactive Mandate Revocation Checklist & Status Tracker  
**Hackathon Track**: hackFront India 2026 (Track T4.1 — *The Auto Debits Nobody Can Find*)  
**Design Standards Applied**: `frontend-design`, `gsap-timeline`, `gsap-react`, `threejs-r3f`, `threejs-animation`  

---

## 1. Creative Concept & Narrative Premise

### 1.1 The Narrative Job
In the hackathon presentation, Feature 5 is the **Action & Empowerment Climax** (Act 4 of the 3-minute pitch). 

When a user identifies a recurring charge like `STRMBEE AUTO` or `CLDNST DIGITAL`, detection alone is passive. People routinely ask: *"How do I actually kill this auto-debit?"* Under Indian banking regulations (NPCI UPI AutoPay OC No. 223, RBI e-Mandate Framework RBI/2024-25/64), users possess statutory rights to pause or revoke mandates directly via UPI apps (GPay, PhonePe, Paytm) or card issuer hubs without merchant consent. 

Feature 5 transforms the static cancellation guidance text into a **tactile, cinematic mandate revocation command console**:
- Users track their step-by-step revocation journey with physical, satisfying tactile feedback.
- A **selective 3D regulatory seal** ("NPCI/RBI Mandate Shield") provides tangible depth, rotating subtly with cursor parallax and resolving into an embossed evergreen seal upon checklist completion.
- Clear distinction is maintained between **tracking** personal actions and **initiating bank operations** (avoiding false bank execution claims).

### 1.2 Design Philosophy: Editorial Warmth Meets Tactile Craft
Guided by `frontend-design` and [`DESIGN.md`](file:///d:/Projects/Fintech-Recurring-Intelligence/DESIGN.md):
- **No generic SaaS cards or neo-brutalist neon gradients**: Stay strictly within FinSight's warm editorial ledger palette (`--canvas: #ECE9E1`, `--surface: #F8F6EF`, `--ink: #242A25`, `--evergreen: #24563F`, `--attention: #79551F`).
- **Tactile Paper Physics**: Dialogs and checklist steps feel like debossed ledger strips being physically verified and stamped.
- **Selective 3D**: Three.js/R3F is not used as decorative background noise; it is focused entirely on the **3D Mandate Seal Canvas** inside the guidance card, giving physical weight to Indian regulatory protection.

---

## 2. Token System & Typographic Architecture

Consistent with [`DESIGN.md`](file:///d:/Projects/Fintech-Recurring-Intelligence/DESIGN.md):

| Token | Hex | Role in Feature 5 |
|---|---|---|
| `--canvas` | `#ECE9E1` | Deep mineral backdrop behind modal backdrop wash |
| `--surface` | `#F8F6EF` | Uncoated paper card surface for checklist cards |
| `--surface-inset` | `#E6E2D8` | Recessed checklist step track / debossed container |
| `--line` | `#CBC7BC` | Delicate ledger hairline dividers between steps |
| `--ink` | `#242A25` | Primary typographic ink |
| `--muted` | `#4D5A51` | Step body copy, regulatory citations, instructions |
| `--quiet` | `#5D695F` | Step numbers, timestamp tags, checklist metadata |
| `--evergreen` | `#24563F` | Active progress fill, completed checkmarks, sealed status |
| `--evergreen-wash` | `#E3EFE8` | Completed step background tint |
| `--attention` | `#79551F` | Warning notes, unverified step alerts |
| `--attention-wash` | `#F1E8D5` | Note container tint |

### Typography Scale
- **Modal Title**: `DM Serif Display`, 28px, 1.15 line height, regular weight.
- **Section Eyebrow**: `Plus Jakarta Sans`, 13px, 600 weight, sentence-case, `--muted` (no tracked-out all-caps).
- **Checklist Step Titles**: `Plus Jakarta Sans`, 15px, 600 weight, 1.4 line height.
- **Step Instructions**: `Plus Jakarta Sans`, 14px, 400 weight, 1.6 line height.
- **Regulatory Monospace Badges**: `JetBrains Mono`, 12px, tabular figures for circular citations (e.g., `NPCI OC-223`).

---

## 3. Component Architecture & UI Anatomy

The enhanced detail modal integrates the **Mandate Revocation Command Console**:

```
+---------------------------------------------------------------------------------+
|  [Merchant Details & Metrics Header]                            [ Close Button ] |
|  CloudNest · ₹599.00 Quarterly · 4 Transactions · Confidence 94%                |
+---------------------------------------------------------------------------------+
|                                                                                 |
|  +-- [3D Regulatory Mandate Shield Header] ----------------------------------+  |
|  |  [ R3F Canvas: Interactive 3D Coin/Seal ]                                  |  |
|  |  NPCI UPI AutoPay Framework (OC No. 223) · Verified Statutory Right         |  |
|  |  "You have the unilateral legal right to revoke this mandate in your app"  |  |
|  +---------------------------------------------------------------------------+  |
|                                                                                 |
|  +-- [Interactive Revocation Tracker] ---------------------------------------+  |
|  |  Overall Status: [ ● In Progress (Step 2 of 5) ]      Progress: [======   ] |  |
|  |                                                                           |  |
|  |  [✓] 1. Open Primary UPI App                                             |  |
|  |      Completed · Google Pay / PhonePe / Paytm                             |  |
|  |                                                                           |  |
|  |  [●] 2. Locate Active AutoPay Mandate                         [ CURRENT ] |  |
|  |      Navigate to Profile > UPI AutoPay > Search "CLDNST DIGITAL"          |  |
|  |      [ Tap to expand visual navigation hint ]                             |  |
|  |                                                                           |  |
|  |  [ ] 3. Select 'Revoke / Cancel Mandate'                                  |  |
|  |      Do NOT select 'Pause' if you wish to permanently terminate billing   |  |
|  |                                                                           |  |
|  |  [ ] 4. Authorize with UPI PIN                                            |  |
|  |      Enter your 4 or 6 digit secret UPI PIN to sign revocation            |  |
|  |                                                                           |  |
|  |  [ ] 5. Verify Revocation Acknowledgment                                  |  |
|  |      Confirm SMS received with Mandate UMN (Unique Mandate Number)        |  |
|  +---------------------------------------------------------------------------+  |
|                                                                                 |
|  +-- [Regulatory Safeguard Disclaimer] --------------------------------------+  |
|  |  ⓘ FinSight is an evidence tracker. Marking steps complete records your   |  |
|  |    checklist progress locally. It does not transmit instructions to banks.|  |
|  +---------------------------------------------------------------------------+  |
|                                                                                 |
|  [ Reset Checklist ]                             [ Mark Mandate as Revoked ] |  |
+---------------------------------------------------------------------------------+
```

---

## 4. Motion Choreography & GSAP Sequencing

Motion is built using **GSAP 3** (`gsap-timeline`, `gsap-react` with the `useGSAP` hook) to ensure strict component cleanup and frame-perfect choreography.

### 4.1 Sequence 1: Dialog Cinematic Entrance
When clicking a commitment row:
```typescript
// Choreographed entrance timeline via useGSAP
const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

tl.fromTo(".modal-backdrop", 
    { opacity: 0 }, 
    { opacity: 1, duration: 0.25 }
  )
  .fromTo(".modal-container", 
    { y: 32, opacity: 0, scale: 0.98 }, 
    { y: 0, opacity: 1, scale: 1, duration: 0.35 }, 
    "-=0.15"
  )
  .from(".r3f-seal-canvas", 
    { scale: 0.8, opacity: 0, rotationY: -45, duration: 0.5, ease: "back.out(1.4)" }, 
    "-=0.2"
  )
  .from(".checklist-step-card", 
    { x: -16, opacity: 0, stagger: 0.06, duration: 0.3 }, 
    "-=0.25"
  )
  .from(".tracker-progress-bar", 
    { scaleX: 0, transformOrigin: "left center", duration: 0.4 }, 
    "-=0.2"
  );
```

### 4.2 Sequence 2: Step Interaction & Checkmark Stagger
When a user clicks a step checkbox:
1. **The Click Ripple**: The circular checkbox boundary compresses slightly (`scale: 0.88`, 100ms) and expands with a crisp elastic snap (`scale: 1.05` $\to$ `1.0`, `ease: "back.out(2)"`).
2. **SVG Checkmark Draw**: An SVG stroke dashoffset animation draws the checkmark path from 0 to 100% over 220ms (`ease: "power2.inOut"`).
3. **Card State Shift**: The step container transitions from neutral paper (`--surface`) to a gentle evergreen wash (`--evergreen-wash: #E3EFE8`) with a border color interpolation (`--line` $\to$ `--evergreen`).
4. **Active Focus Handoff**: The next step automatically expands its instructional accordion with a smooth height reveal (`duration: 0.28s`, `ease: "power2.out"`).
5. **Progress Bar Spring**: The top progress meter updates smoothly with numerical indicator interpolation (`Step 2 of 5` $\to$ `Step 3 of 5`).

### 4.3 Sequence 3: The Climax Celebration (Mandate Fully Revoked)
When the 5th and final step is checked:
- **The R3F Shield Reaction**: The 3D Mandate Seal performs a 360-degree ceremonial spin on the Y-axis and emits a subtle radial pulse particle ring in Three.js.
- **The "Revocation Verified" Badge**: A debossed gold/evergreen status badge stamps into place with an elastic drop (`scale: 1.3` $\to$ `1.0`, `duration: 0.35s`, `ease: "back.out(1.8)"`).
- **Tactile Card Summary**: An updated status tag in the parent table row updates to `"Revocation In Progress"` with persistent local storage.

---

## 5. Three.js / React Three Fiber (R3F) 3D Shield Architecture

Guided by `threejs-r3f` and `threejs-animation`:

### 5.1 The 3D Scene Specification
The top of the cancellation card features an embedded, lightweight `<Canvas>` (140px width, 140px height) rendering the **Indian Regulatory Mandate Seal**:
- **Geometry**: A low-poly cylindrical coin with bevelled edges (`CylinderGeometry(radiusTop=2.2, radiusBottom=2.2, height=0.25, radialSegments=48)`).
- **Material**: A subtle brushed metal shader (`MeshPhysicalMaterial`) tinted with warm mineral bronze and paper tones (`roughness: 0.35`, `metalness: 0.65`, `clearcoat: 0.3`).
- **Texture / Relief**: A bump/normal map embossing the Ashoka Lion Capitol silhouette or the NPCI AutoPay geometric glyph with circular text *"RBI REGULATORY FRAMEWORK · NPCI OC NO. 223"*.
- **Lighting**:
  - Warm key light: `DirectionalLight` (tint `#FFF5E6`, intensity `1.8`) positioned at `[3, 4, 5]`.
  - Cool rim light: `DirectionalLight` (tint `#D8E2DC`, intensity `1.2`) positioned at `[-4, -2, -3]`.
  - Ambient base: `AmbientLight` (intensity `0.6`).

### 5.2 Interactive Physics & Motion Behavior
- **Idle Ambient Motion**: Gentle procedural levitation using a sine wave in `useFrame`:
  $$y(t) = y_0 + \sin(t \times 1.4) \times 0.08$$
  $$\text{rot}_y(t) = \text{rot}_0 + \sin(t \times 0.8) \times 0.15$$
- **Cursor Parallax Tracking**: The seal subtly tilts toward the user’s pointer coordinates inside the card using frame-independent exponential damping (`1 - exp(-12 * delta)`):
  $$\text{targetRotX} = (\text{mouseY} - \text{centerY}) \times 0.4$$
  $$\text{targetRotY} = (\text{mouseX} - \text{centerX}) \times 0.4$$
- **Completion Event**: Triggered via ref callback when all checklist steps are checked:
  - Rotates `rot_y += Math.PI * 2` over 0.8 seconds with `power3.inOut`.
  - Material emissive color pulses to evergreen (`#24563F`, intensity `0.4` $\to$ `0.0`).

### 5.3 Performance & Lifecycle Safeguards (R3F Best Practices)
- **Demand Rendering**: Canvas renders in `frameloop="always"` only while modal is open; sets `frameloop="demand"` when idle.
- **Resource Disposal**: Geometry, materials, and textures are explicitly disposed when the modal unmounts.
- **Strict Bounds**: WebGL context is sandboxed to the 140px frame to guarantee 60 FPS on standard laptops and mobile screens.

---

## 6. Regulatory Truth & Compliance Boundaries

FinSight must strictly adhere to regulatory honesty:
1. **Clear Disclaimers**: Every checklist card displays an explicit notice:
   > *"FinSight is an evidence-tracking companion. Checking items off this list records your personal verification steps locally in your browser. It does not connect to UPI or bank APIs to unilaterally revoke mandates on your behalf."*
2. **Status Distinction**:
   - Status 1: `Active Detected Pattern` (Observed from statement).
   - Status 2: `Revocation Tracking Initiated` (User commenced checklist).
   - Status 3: `Marked as Revoked (User Verified)` (User attested to receiving bank SMS).
   - FinSight **never** claims: *"Mandate Revoked via NPCI Gateway"*.

---

## 7. State Management & Persistence Model

Progress is tracked per `commitment_id` in browser `localStorage`:

```typescript
interface MandateRevocationState {
  commitmentId: string;
  paymentMethod: string;
  totalSteps: number;
  completedStepIndices: number[];
  status: 'not_started' | 'in_progress' | 'marked_revoked';
  lastUpdatedIso: string;
  notes?: string;
}
```

- When the modal opens, it reads existing state for that `commitment_id`.
- Toggling a checkbox updates state immutably and persists to `localStorage.setItem('finsight_mandate_revocations', ...)`.
- The parent commitment table displays a live badge: e.g. `[● Revocation in Progress: 3/5]` or `[✓ Marked Revoked]`.

---

## 8. Implementation Dependencies & Technology Stack

To implement this specification, the frontend will integrate:
1. **Animation**: `gsap` (^3.12.5) and `@gsap/react` (^2.1.1) for timelines and lifecycle cleanup.
2. **3D Elements**: `three` (^0.170.0), `@react-three/fiber` (^8.17.0), and `@react-three/drei` (^9.115.0).
3. **Icons**: `lucide-react` (already installed).
4. **Styles**: Hand-crafted CSS classes in `frontend/src/App.css` adhering to the existing CSS variable token system.

*Note: As per instructions, zero packages will be installed until implementation authorization.*

---

## 9. Verification & Acceptance Criteria

1. **Visual Fidelity**:
   - Matches the warm editorial ledger tokens (`#ECE9E1`, `#F8F6EF`, `#24563F`).
   - Zero layout shifts or clipping on viewports from 375px (mobile) to 1440px (desktop).
2. **Motion Fluidity**:
   - GSAP timeline enters cleanly without dropped frames ($\ge 55\text{ FPS}$).
   - `prefers-reduced-motion` media query disables non-essential 3D rotation and stagger animations, falling back to instant opacity transitions.
3. **Interactive Completeness**:
   - Checking steps updates progress bar and step counter immediately.
   - Persistence verified: reloading browser preserves checked steps and status tags.
   - "Reset Progress" button clears checklist with confirmation.
4. **3D Performance**:
   - R3F canvas maintains 60 FPS; WebGL context cleanly disposes on modal close.
5. **Truthful Framing**:
   - Regulatory disclaimer is visible; no deceptive "bank connection" language is present.

