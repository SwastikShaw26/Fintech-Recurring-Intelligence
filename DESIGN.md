# FinSight design direction

> **Direction:** Make FinSight feel like a warm editorial ledger: a paper-toned evidence workspace where recurring charges read like entries under review, with one evergreen signal and no decorative finance-dashboard chrome.

**Status:** This approved direction replaces the former dark charcoal and mint identity. It is implemented in the current frontend.

## Design notes

The full current-interface audit is recorded in `UI_AUDIT.md`. This brief captures the approved direction, implemented token system, screen rules, and the product patterns that informed it.

## Implemented tokens

| Role | Token | Proposed value |
| --- | --- | --- |
| Warm mineral canvas | `--canvas` | `#ECE9E1` |
| Uncoated paper | `--surface` | `#F8F6EF` |
| Inset surface | `--surface-inset` | `#E6E2D8` |
| Rule | `--line` | `#CBC7BC` |
| Primary text | `--ink` | `#242A25` |
| Supporting text | `--muted` | `#4D5A51` |
| Quiet text | `--quiet` | `#5D695F` |
| Primary signal | `--evergreen` | `#24563F` |
| Review / error signal | `--attention` | `#79551F` |
| Attention wash | `--attention-wash` | `#F1E8D5` |

Contrast ratios calculated from these hex values: ink on paper 13.55:1, supporting text 6.70:1, quiet text 5.32:1, evergreen on paper 7.84:1, and attention on its wash 5.51:1. Use labels and icons alongside semantic color so color is never the only cue.

| System | Proposed values |
| --- | --- |
| Display | DM Serif Display, 40px desktop and 38px tablet/mobile, 1.12 line height, regular weight; page title and leading amount only |
| UI text | Plus Jakarta Sans, 15px / 1.6 body; 12 / 13 / 15 / 18 / 22 / 28px supporting scale |
| Data | JetBrains Mono, 13–15px, tabular numerals; amounts and dates only |
| Measure | 55–75 characters for explanatory copy; left aligned |
| Spacing | 4px base: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px |
| Radius | 4px controls, 8px panels; square table rows |
| Shadows | None on panels; one soft shadow on the dialog only |
| Motion | 150ms control feedback; 220ms dialog entry with a 4px lift; ease-out for entry and ease-in-out for movement; disable nonessential motion for reduced motion |

## Screen rules

- Make one real figure dominant: the current estimated monthly equivalent, with its annual estimate and detected/review counts as quiet, aligned facts rather than four equal cards.
- The fabricated month-to-month line has been removed. There is no monthly history endpoint, so the overview leads with actual detected patterns and review flags instead.
- Keep the wide evidence table and narrower review list, but use rules and type hierarchy in place of nested card decoration. Let the review queue carry the one attention color.
- Remove icon tiles where the icon repeats the adjacent label. Keep Lucide at one stroke weight for controls that need visual recognition.
- Replace all-caps micro-labels, placeholder initials, technical empty-state instructions, and internal evaluation jargon with sentence-case product language.
- Keep the existing keyboard dialog, focus ring, skeleton, error/retry, empty states, responsive behavior, and reduced-motion support while bringing their visual styles under the shared token system.

## Product references

These are product-structure references, not instructions to copy their brand styling. Wise describes a streamlined account overview that groups currencies, jars, and groups for easier scanning ([Wise account update](https://wise.com/help/articles/645Ve1Ah1Psi0srHGfKYmm/your-wise-account-has-a-new-look)). Copilot separates dashboard spend progress, items to review, and upcoming recurrings, and has dedicated recurring filters/details ([Copilot dashboard](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview), [recurrings](https://help.copilot.money/en/articles/9778259-recurrings-tab-overview)). Mercury’s transaction update pairs a cashflow view with a breakdown that can be grouped by account, category, or merchant ([Mercury transactions](https://mercury.com/blog/updated-transactions-page)). For FinSight, use those patterns only when the corresponding data exists; do not imply live bank links, upcoming charges, or user-editable schedules.
