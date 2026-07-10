# RepurposePro VS1 Design References

These files are the canonical visual references for the VS1 authentication and dashboard work. They extend the direction established in `docs/brand/repurposepro-brandkit.png` and must be interpreted together with `docs/ui-tokens.md`, `docs/ui-rules.md`, and `docs/ui-registry.md`.

## Screen References

| Screen | Reference | Primary UI outcome |
|---|---|---|
| Signup | `signup.png` | A new creator can enter name, email, and password and create an account. |
| Login | `login.png` | A returning creator can enter email and password and log in. |
| Authenticated dashboard shell | `authenticated-dashboard-shell.png` | Defines persistent desktop sidebar, topbar, credit shortcut, page header, project cards, and user controls. |
| Dashboard empty state | `dashboard-empty-state.png` | Defines the first-login dashboard with no projects, zero-credit messaging, retention note, and one dominant New Project action. |

## Reusable Media Assets

| Asset | File | Intended use |
|---|---|---|
| RP logo mark, preferred | `assets/repurposepro-mark.svg` | Sidebar, auth header, compact brand lockup, and scalable monochrome/color use. |
| RP logo mark, raster fallback | `assets/repurposepro-mark.png` | Raster-only consumers; transparent 512px fallback. |
| App icon, preferred | `assets/repurposepro-app-icon.svg` | App icon source, favicon source, and branded square tile. |
| App icon, raster fallback | `assets/repurposepro-app-icon.png` | Raster-only app icon use at 512px. |
| Source-to-clips auth visual | `assets/auth-source-to-clips.png` | Signup/login art panel, responsive hero crop, or low-priority decorative media. |
| Empty-projects illustration | `assets/empty-projects-illustration.png` | Dashboard empty-state illustration inside a dark panel or page surface. |
| Short-clips project thumbnail | `assets/project-thumbnail-clips.png` | Fixture/demo thumbnail for populated dashboard clip-project cards. |
| Summary project thumbnail | `assets/project-thumbnail-summary.png` | Fixture/demo thumbnail for populated dashboard summary-project cards. |

The UI must remain usable if decorative media is hidden or fails to load. The form and empty-state copy carry the user outcome.

## Shared Visual System

- Page background: `#0B0D12`
- Deep canvas: `#050608`
- Graphite surface: `#11141B`
- Panel surface: `#151821`
- Elevated surface: `#1A1D25`
- Primary violet: `#7B61FF`
- Violet highlight: `#9B8CFF`
- Primary text: `#F5F6F8`
- Secondary text: `#B9BDCF`
- Default border: `#2A3040`
- Typography: Satoshi when available; Inter fallback
- Default card/input radius: 12px
- App-panel radius: 16px
- Desktop sidebar: 264px
- Desktop topbar: 64px
- Desktop page padding: 32px

Use subtle borders for separation. Restrict violet glow to primary actions and a single media focal point. Use rounded, minimal Lucide-style icons at 1.5–2px stroke.

## Responsive Interpretation

### Signup and Login

- Desktop: preserve the asymmetric media/form split shown in the reference.
- Tablet: reduce the media panel and preserve a comfortable form width.
- Mobile: render the form first in one column; crop or hide decorative media when needed.
- Form controls remain at least 44px high and labels remain visible.

### Authenticated Dashboard

- Desktop: persistent 264px sidebar and full topbar.
- Tablet: compact/collapsed sidebar and two-column project grid when space allows.
- Mobile: sidebar moves into a drawer, cards stack, and the New Project action remains visible near the page heading.
- Do not change the navigation model between populated and empty dashboard states.

## Content and Data Notes

- Names, dates, project titles, statuses, clip counts, and credit values in the populated dashboard are illustrative fixtures.
- Credit balances must come from the authoritative ledger when implemented.
- The empty state intentionally uses `0 credits` and keeps Buy credits visually secondary to New Project.
- The seven-day retention note reflects the documented MVP policy.
- Do not add social login, password reset, free-credit claims, fake KPIs, charts, or onboarding carousels unless later product requirements authorize them.

## Production Asset Note

The SVG mark and app icon are the implementation-ready vector sources for the current concept direction; their PNG siblings are fallbacks. The full-screen PNGs remain visual references, while the remaining PNGs are reusable media assets.

The RP mark still requires stakeholder approval and trademark/conflict review before it is treated as a registered commercial logo.

## Asset Boundary

The VS1 design set now contains all required static visual assets. Keep the following implementation-native instead of adding more raster files:

- Navigation, form, credit, settings, upload, and status icons: `lucide-react`.
- Initials avatar: CSS-rendered circle with authenticated user initials.
- Borders, technical grids, violet glow, focus rings, and progress tracks: CSS.
- Small project-card waveform rails: CSS or inline SVG derived from live/static data.
- Wordmark text: Satoshi/Inter text next to `repurposepro-mark.svg`, not baked into another image.
