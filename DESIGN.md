# RepurposePro UI Design

This document is the implementation-facing visual reference for RepurposePro. It records the design language that exists in the current web app and the rules future UI should follow.

It complements, rather than replaces:

- [`docs/ui-tokens.md`](docs/ui-tokens.md) for the complete token catalog.
- [`docs/ui-rules.md`](docs/ui-rules.md) for product behavior and UX rules.
- [`docs/ui-registry.md`](docs/ui-registry.md) for component ownership and contracts.

## Design read

RepurposePro is a premium, creator-focused video SaaS with a dark-tech and cinematic visual language. The interface uses a restrained charcoal foundation, a single ember signal accent, compact sans-serif typography, and editorial video framing to make one idea feel central: one long recording becomes several focused outputs.

The current design reads as:

| Dial             | Current direction | Why                                                                                      |
| ---------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| Design variance  | 6/10              | Controlled asymmetry in the split hero, output gallery, and preview/editor compositions. |
| Motion intensity | 2/10              | Interaction is mostly state-based; the mobile drawer is the main animated surface.       |
| Visual density   | 4/10              | Spacious marketing sections with compact, scannable product chrome.                      |

The product should feel calm, capable, and intentional. It should not look like a generic AI dashboard, a full professional NLE, or a collection of unrelated marketing cards.

## Core principles

1. **Metadata first, render later.** Browser previews and metadata edits should feel immediate. Final MP4 rendering is an explicit action.
2. **One source, focused outputs.** Use source-to-output relationships as the main visual story: widescreen source, vertical clips, and a chronological summary.
3. **One primary action per screen.** Ember is reserved for the action the user should take next.
4. **Clarity over complexity.** Every screen should answer what is happening, what it costs, and what the user can do next.
5. **Dark surfaces, clear hierarchy.** Separate levels with surface shifts, borders, spacing, and type scale before adding more decoration.
6. **Creator trust.** Use real-looking editorial imagery, direct copy, explicit processing states, and human-readable errors.

## Visual foundation

### Color system

The page is dark by default. Do not introduce a second theme or a second accent family without updating the token docs first.

| Role             | Token                   | Value     | Use                                                                         |
| ---------------- | ----------------------- | --------- | --------------------------------------------------------------------------- |
| Page background  | `--rp-bg`               | `#0B0D12` | Main app and marketing canvas.                                              |
| Deep background  | `--rp-bg-deep`          | `#050608` | Hero overlays, CTA footer, and video canvas.                                |
| Shell surface    | `--rp-surface`          | `#11141B` | Sidebar, sections, and elevated navigation surfaces.                        |
| Elevated surface | `--rp-surface-elevated` | `#1A1D25` | Secondary panels and grouped controls.                                      |
| Card surface     | `--rp-card`             | `#151821` | Cards, muted controls, and compact UI groups.                               |
| Border           | `--rp-border`           | `#2A3040` | Standard dividers and field borders.                                        |
| Strong border    | `--rp-border-strong`    | `#42495B` | Focused or emphasized boundaries.                                           |
| Primary text     | `--rp-text`             | `#F5F6F8` | Headings and high-emphasis content.                                         |
| Secondary text   | `--rp-text-secondary`   | `#D4D7E2` | Supporting high-emphasis content.                                           |
| Muted text       | `--rp-text-muted`       | `#B9BDCF` | Body copy, descriptions, and metadata.                                      |
| Disabled text    | `--rp-text-disabled`    | `#6F768A` | Locked or unavailable actions.                                              |
| Brand accent     | `--rp-primary`          | `#C4522A` | Primary actions, active states, AI signal, progress, and highlighted words. |
| Accent hover     | `--rp-primary-hover`    | `#AA3E1D` | Hover state for primary actions.                                            |
| Accent active    | `--rp-primary-active`   | `#8E3115` | Pressed state.                                                              |
| Accent soft      | `--rp-primary-soft`     | `#2B0F06` | Tinted surfaces, icon wells, and active navigation.                         |

Semantic colors are already defined for success (`#42D392`), warning (`#F5C542`), danger (`#FF5C7A`), and info (`#6BA8FF`). Always pair semantic color with text or an icon; color alone must not communicate state.

Video-specific tokens remain distinct from general UI tokens:

- `--rp-video-canvas`: `#050608`
- `--rp-timeline-track`: `#242A38`
- `--rp-timeline-progress`: `#C4522A`
- `--rp-timeline-selection`: `#DF7652`
- `--rp-waveform-muted`: `#3A4052`
- `--rp-waveform-active`: `#C4522A`
- `--rp-crop-frame`: `#B9BDCF`
- `--rp-safe-zone`: `#C4522A33`

The global stylesheet is the source of truth for these values and maps them into Tailwind v4 with `@theme inline`.

### Typography

Use a compact, modern sans-serif hierarchy with tight display tracking and comfortable body leading.

| Role                 | Direction                                                                            |
| -------------------- | ------------------------------------------------------------------------------------ |
| Display / page title | Semibold, tight tracking around `-0.055em`, tight leading around `0.98` to `1.1`.    |
| Section title        | `text-4xl` to `text-5xl`, semibold, tight tracking.                                  |
| Body                 | `text-base` or `text-lg`, `leading-7`, muted color for supporting copy.              |
| UI label             | `text-sm`, medium or semibold.                                                       |
| Metadata             | `text-xs` to `text-sm`, muted or disabled color.                                     |
| Caption preview      | Bold or extra-bold uppercase, white with ember keyword highlights and a dark shadow. |

Current implementation detail: `apps/web/app/layout.tsx` loads Geist through `next/font`, while `apps/web/app/globals.css` also imports Inter Variable and declares Inter as the Tailwind font fallback. Treat Geist as the current runtime face and remove the duplicate font source when the typography system is normalized. Do not introduce another display family casually.

### Shape and elevation

The product uses a soft-but-controlled radius system:

| Token             | Value  | Typical use                                   |
| ----------------- | ------ | --------------------------------------------- |
| `--rp-radius-xs`  | `4px`  | Small brand details and compact media tiles.  |
| `--rp-radius-sm`  | `8px`  | Brand mark, small controls, and tight media.  |
| `--rp-radius-md`  | `12px` | Buttons, inputs, nav items, and most cards.   |
| `--rp-radius-lg`  | `16px` | Hero media, feature panels, and larger cards. |
| `--rp-radius-xl`  | `20px` | Large future editor surfaces.                 |
| `--rp-radius-2xl` | `24px` | Reserved for exceptional large surfaces.      |

Use elevation sparingly:

- `--rp-shadow-card` for compact cards and floating clip tiles.
- `--rp-shadow-panel` for hero media and large preview surfaces.
- `--rp-shadow-modal` for drawers and dialogs.
- `--rp-shadow-glow` and `--rp-shadow-glow-strong` only for primary ember signal moments.

Avoid adding a shadow to every container. A border, surface shift, or whitespace is often the better separator.

## Layout language

### Shared geometry

- Use the existing `max-w-7xl` or `max-w-[90rem]` content bounds.
- Use horizontal page padding of `px-5` on small screens, `sm:px-8`, and `lg:px-10` on large screens.
- Use the existing 4px-derived spacing scale. Common section rhythm is `py-24` to `sm:py-32`.
- Keep the first screen readable on a small laptop. The hero headline is short, the CTA is visible, and the visual does real communication work.
- Use `min-h-dvh`, not `h-screen`, for viewport-height surfaces.

### Responsive behavior

The app is mobile-first for marketing, dashboard, upload, billing, and output surfaces. The future clip editor is desktop-first and may collapse panels into tabs or sheets.

| Range          | Behavior                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| `< 640px`      | Single-column content, stacked CTAs, compact nav, vertical workflow, full-width controls. |
| `640px–767px`  | More generous padding and two-column opportunities where content remains legible.         |
| `768px–1023px` | Tablet layouts; keep reading order and avoid forcing editor-level density.                |
| `≥ 1024px`     | Desktop split layouts, persistent dashboard sidebar, multi-column marketing compositions. |
| `≥ 1280px`     | Full marketing composition with generous negative space and controlled media scale.       |

Observed mobile behavior at 390px: landing navigation collapses to brand plus CTA; the hero stacks content above the source media; the four-step workflow becomes a vertical sequence; output previews remain legible as a 3-up vertical strip; pricing cards stack; and the footer wraps without horizontal scrolling.

### Composition patterns

Use these patterns as the established vocabulary:

- **Split source hero:** left-aligned message and CTA, right-side widescreen source image with smaller vertical output tiles.
- **Linear workflow:** four steps connected by a subtle horizontal ember line on desktop and stacked vertically on mobile.
- **Source-to-output gallery:** text column paired with a 3-up vertical clip preview and a small source strip.
- **Preview-first showcase:** explanatory copy, a large 9:16 crop preview, and a short list of trim/crop/caption capabilities.
- **Focused pricing:** three packs, one featured middle option, no excessive feature matrix.
- **Editorial CTA:** large statement, short supporting copy, one action, then a quiet footer.

Do not turn every section into a bordered card grid. Composition should alternate between open layout, media framing, and grouped surfaces.

## Page blueprints

### Landing page

Implemented in `apps/web/features/marketing/components/`.

1. Persistent translucent header with brand, anchor navigation, sign-in link, and one ember CTA.
2. Split hero: product promise on the left, cinematic source video visual on the right.
3. Workflow section: Upload, Find the moments, Shape the preview, Render on command.
4. Outputs section: short clips and summary video shown as distinct focused outcomes.
5. Preview section: crop frame and caption treatment communicate metadata-first editing.
6. Pricing section: `$0.25 per video minute` with Starter, Creator, and Pro packs.
7. Final CTA and restrained footer.

The landing page should keep copy direct and creator-oriented. Prefer outcome language such as “strongest moments,” “focused outputs,” and “render when it is right.” Avoid technical pipeline language above the fold.

### Authentication

Implemented in `apps/web/features/auth/components/`.

- Desktop: two-column shell with cinematic podcast imagery on the left and a centered form on the right.
- Mobile: form-first layout with brand and back link, without the decorative image panel.
- Use visible labels, 44px-class controls, inline error blocks, a password visibility toggle, and explicit pending copy.
- Keep the auth surface quiet: one heading, one short explanation, one form, one route-switch link.

### Dashboard shell

Implemented in `apps/web/components/app/` and `apps/web/app/dashboard/page.tsx`.

- Desktop: fixed left sidebar, sticky topbar, content area with controlled max width.
- Mobile: topbar menu opens a focus-managed drawer rendered above the app surface.
- Sidebar navigation: Dashboard is active; future areas can be visibly locked until their vertical slice exists.
- Empty states should explain what will appear and what the user can do next.
- The first real project dashboard should preserve the current “workspace” framing while replacing the VS1 lock notice with the VS2 primary action.

## Component language

### Shared primitives

Low-level primitives live in `apps/web/components/ui/` and should stay domain-agnostic:

- `Button`: compact, rounded, high-contrast, with clear hover, focus, pressed, and disabled states.
- `Input`: dark surface, `--rp-border` default, ember focus ring, muted placeholder.
- `Card`: grouped surface with restrained elevation.
- `Badge`: compact status or metadata label; do not overuse badges as decoration.

### Shared app components

Live in `apps/web/components/app/`:

- `BrandMark`: 8px-radius ember “R” tile plus RepurposePro wordmark.
- `AppSidebar`: desktop navigation and locked-feature messaging.
- `AppTopbar`: sticky context bar with page title, identity, and sign-out.
- `MobileNavigation`: portal-based drawer with backdrop, focus return, Escape close, and safe-area padding.
- `PageHeader`: shared page title and description block.
- `EmptyState`: centered icon, explanation, and next action.

### Iconography

The current codebase uses `lucide-react`. Keep one icon family across the product, use icons as supporting signals rather than decoration, and give icon-only controls accessible labels. Do not use emoji as UI icons or hand-drawn SVG paths.

## Motion and interaction

Motion is currently restrained and functional:

- Use color and opacity transitions for hover and focus.
- Use a small pressed translation or scale for tactile button feedback.
- Use the mobile navigation drawer slide/fade to preserve spatial context.
- Keep transitions in the 150–300ms range.
- Respect `prefers-reduced-motion`; animated loaders should retain a non-animated state.
- Never make a costly action happen on hover or from an ambiguous click target.

When future processing states are added, prefer skeletons and staged progress over a generic spinner. The current auth form already communicates pending state through disabled fields, a loader icon, and action-specific copy.

## Accessibility and trust checklist

- Keep a logical heading order: one `h1`, then section `h2`s, then component `h3`s.
- Preserve visible focus rings using the ember ring token.
- Keep interactive targets at least 44px in the compact UI.
- Use labels for every field and inline error messaging near the field group.
- Use `aria-live` for asynchronous auth and processing errors.
- Do not rely on ember, green, red, or yellow alone to communicate status.
- Keep captions within safe zones and make the final preview readable against the video.
- Provide recovery actions for failures: retry, edit, go back, or contact support.
- Explain credit impact before processing and rendering.
- Explain the 7-day file retention behavior where uploads and outputs are managed.

## Do and do not

### Do

- Use charcoal, slate, and ember tokens from `globals.css`.
- Keep one clear primary CTA per screen.
- Pair dark surfaces with subtle borders and deliberate whitespace.
- Use the podcast-studio image treatment as the current media reference: low-key, warm skin tones, black studio, ember practical light, and strong subject framing.
- Make vertical 9:16 media a first-class visual element.
- Keep copy short, direct, and creator-focused.
- Build feature-specific UI under `features/<feature>/components/`.

### Do not

- Add a second accent color or switch to light mode casually.
- Add ember gradients, glows, or glass effects as decoration without a product reason.
- Use cards inside cards inside cards.
- Build a full timeline editor before the MVP slices require it.
- Render MP4 files during ordinary preview edits.
- Use raw hex values in feature components when a semantic token exists.
- Hide important information in hover-only affordances.
- Use color-only status communication.

## Current implementation notes

The current code is visually coherent, but these details should be normalized deliberately in future UI work:

1. `layout.tsx` loads Geist while `globals.css` imports and names Inter. Pick one canonical font source and remove the duplicate import/fallback.
2. The shared primitives use the generated shadcn/base-ui radius and color classes, while product surfaces use `rp-*` tokens. Keep the two layers aligned rather than creating a third token vocabulary.
3. Current landing imagery reuses one source asset at different crops. When more product imagery is added, preserve the same low-key studio lighting and ensure each new asset has a clear job.
4. The design currently has minimal motion. Add motion only when it explains hierarchy, progress, or state, and keep reduced-motion behavior explicit.

## Source map

| Concern                                                              | Source                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime colors, typography mapping, radius, shadows, base background | [`apps/web/app/globals.css`](apps/web/app/globals.css)                                                                                                                                                                                                                                                                                                                                                                  |
| Global font loading and dark theme                                   | [`apps/web/app/layout.tsx`](apps/web/app/layout.tsx)                                                                                                                                                                                                                                                                                                                                                                    |
| Landing composition                                                  | [`apps/web/features/marketing/components/landing-page.tsx`](apps/web/features/marketing/components/landing-page.tsx), [`landing-hero-workflow.tsx`](apps/web/features/marketing/components/landing-hero-workflow.tsx), [`landing-outputs-preview.tsx`](apps/web/features/marketing/components/landing-outputs-preview.tsx), [`landing-pricing-cta.tsx`](apps/web/features/marketing/components/landing-pricing-cta.tsx) |
| Auth composition                                                     | [`apps/web/features/auth/components/auth-shell.tsx`](apps/web/features/auth/components/auth-shell.tsx), [`auth-form.tsx`](apps/web/features/auth/components/auth-form.tsx)                                                                                                                                                                                                                                              |
| Dashboard shell                                                      | [`apps/web/app/dashboard/page.tsx`](apps/web/app/dashboard/page.tsx), [`apps/web/components/app/app-sidebar.tsx`](apps/web/components/app/app-sidebar.tsx), [`app-topbar.tsx`](apps/web/components/app/app-topbar.tsx), [`mobile-navigation.tsx`](apps/web/components/app/mobile-navigation.tsx)                                                                                                                        |
| Primitives                                                           | [`apps/web/components/ui/`](apps/web/components/ui/)                                                                                                                                                                                                                                                                                                                                                                    |
| Brand imagery                                                        | [`apps/web/public/images/podcast-studio.png`](apps/web/public/images/podcast-studio.png)                                                                                                                                                                                                                                                                                                                                |
| Canonical token catalog                                              | [`docs/ui-tokens.md`](docs/ui-tokens.md)                                                                                                                                                                                                                                                                                                                                                                                |
| Canonical behavior rules                                             | [`docs/ui-rules.md`](docs/ui-rules.md)                                                                                                                                                                                                                                                                                                                                                                                  |
| Canonical component registry                                         | [`docs/ui-registry.md`](docs/ui-registry.md)                                                                                                                                                                                                                                                                                                                                                                            |

## Audit basis

This analysis was made from the source files above, the existing UI documentation, the codebase knowledge graph, and local browser renders of the landing page at desktop and 390px mobile widths. The rendered audit confirmed the intended dark/ember visual system, responsive section stacking, 9:16 media treatment, pricing emphasis, and footer wrapping behavior.
