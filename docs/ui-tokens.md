# RepurposePro UI Tokens

## 1. Purpose

This document defines the UI design tokens for **RepurposePro**.

RepurposePro is a premium AI video repurposing app for podcasters and YouTubers. The interface should feel:

- Premium
- Fast
- Creator-focused
- Dark-tech
- Clean
- Trustworthy
- Cinematic
- Production-ready

The visual system should support:

- Upload flows
- Credit/billing flows
- Processing states
- Clip preview editing
- Caption overlays
- Final output downloads
- Dashboard-style project management

Core visual metaphor:

```text
one long video source -> multiple focused outputs
```

The UI should use dark surfaces, ember signal accents, subtle borders, soft glows, and clear hierarchy.

---

## 2. Token Philosophy

RepurposePro should use design tokens instead of random one-off styles.

Tokens should control:

- Colors
- Typography
- Spacing
- Radius
- Shadows
- Borders
- Motion
- Layout
- Status states
- Caption previews
- Video editor controls

The goal is consistency across:

- Next.js pages
- shadcn/ui components
- Tailwind CSS v4 utilities
- dashboard cards
- preview editor
- rendered caption styling

---

## 3. Brand Palette

## 3.1 Core Colors

| Token | Hex | Usage |
|---|---:|---|
| `charcoal` | `#0B0D12` | Main app background |
| `slate` | `#1A1D25` | Primary surfaces |
| `graphite` | `#11141B` | Secondary surfaces |
| `panel` | `#151821` | Cards and panels |
| `ember` | `#C4522A` | Primary brand accent |
| `ember-soft` | `#DF7652` | Hover states and soft highlights |
| `ember-deep` | `#8E3115` | Pressed/active states |
| `mist` | `#B9BDCF` | Muted text |
| `white` | `#F5F6F8` | Primary text |
| `black` | `#050608` | Deep overlays and video background |

---

## 3.2 Neutral Scale

Use this scale for dark UI surfaces and typography.

| Token | Hex | Usage |
|---|---:|---|
| `neutral-0` | `#FFFFFF` | Pure white, rare |
| `neutral-50` | `#F5F6F8` | Primary text |
| `neutral-100` | `#E7E9F0` | High-emphasis text |
| `neutral-200` | `#D4D7E2` | Secondary high text |
| `neutral-300` | `#B9BDCF` | Muted text |
| `neutral-400` | `#8D93A8` | Placeholder text |
| `neutral-500` | `#6F768A` | Disabled text |
| `neutral-600` | `#42495B` | Strong borders |
| `neutral-700` | `#2A3040` | Borders and dividers |
| `neutral-800` | `#1A1D25` | Elevated surface |
| `neutral-850` | `#151821` | Card surface |
| `neutral-900` | `#11141B` | App shell surface |
| `neutral-950` | `#0B0D12` | Page background |
| `neutral-1000` | `#050608` | Deep video canvas |

---

## 3.3 Ember Scale

Use ember for primary actions, active states, AI indicators, progress, and brand moments.

| Token | Hex | Usage |
|---|---:|---|
| `ember-50` | `#FFF3ED` | Rare light backgrounds |
| `ember-100` | `#FDE1D3` | Light text on dark accents |
| `ember-200` | `#F8C3AB` | Soft highlight |
| `ember-300` | `#EE9D7E` | Hover glow |
| `ember-400` | `#DF7652` | Active accents |
| `ember-500` | `#C4522A` | Primary brand |
| `ember-600` | `#AA3E1D` | Button hover |
| `ember-700` | `#8E3115` | Button active |
| `ember-800` | `#702811` | Deep accent |
| `ember-900` | `#4A1A0B` | Dark accent background |
| `ember-950` | `#2B0F06` | Subtle tinted surface |

---

## 3.4 Semantic Colors

| Token | Hex | Usage |
|---|---:|---|
| `success` | `#42D392` | Completed jobs, successful payments |
| `success-soft` | `#123A2A` | Success background |
| `warning` | `#F5C542` | Warnings, near limits |
| `warning-soft` | `#3A2F12` | Warning background |
| `danger` | `#FF5C7A` | Failed jobs, destructive actions |
| `danger-soft` | `#3A121D` | Error background |
| `info` | `#6BA8FF` | Informational states |
| `info-soft` | `#10233F` | Info background |

---

## 3.5 Video-Specific Colors

| Token | Hex | Usage |
|---|---:|---|
| `video-canvas` | `#050608` | Video preview background |
| `timeline-track` | `#242A38` | Timeline base |
| `timeline-progress` | `#C4522A` | Current playback range |
| `timeline-selection` | `#DF7652` | Selected clip range |
| `waveform-muted` | `#3A4052` | Audio waveform inactive |
| `waveform-active` | `#C4522A` | Audio waveform active |
| `crop-frame` | `#B9BDCF` | Crop preview outline |
| `safe-zone` | `#C4522A33` | Caption safe zone overlay |

---

## 4. Tailwind v4 Token Architecture

RepurposePro uses Tailwind CSS v4's CSS-first configuration model.

The global stylesheet should be the source of truth for:

- Brand primitives
- shadcn semantic tokens
- Tailwind theme variables
- Radius tokens
- Shadow tokens
- Font tokens
- Product-specific video/editor colors

Recommended file:

```text
apps/web/app/globals.css
```

Recommended high-level structure:

```css
@import "tailwindcss";

/* Keep imports generated or required by the current shadcn setup here. */
/* Example when present: @import "tw-animate-css"; */

:root {
  /* Raw RepurposePro variables and shadcn semantic variables. */
}

@theme inline {
  /* Map runtime CSS variables to Tailwind utility namespaces. */
}

@layer base {
  /* Minimal global element defaults only. */
}
```

Do not use a `tailwind.config.ts` file for ordinary token customization.

---

## 4.1 Raw RepurposePro CSS Variables

Use regular CSS custom properties for values that may be referenced by Tailwind, JavaScript, canvas overlays, or runtime inline styles.

```css
:root {
  --rp-bg: #0B0D12;
  --rp-bg-deep: #050608;
  --rp-surface: #11141B;
  --rp-surface-elevated: #1A1D25;
  --rp-card: #151821;
  --rp-border: #2A3040;
  --rp-border-strong: #42495B;

  --rp-text: #F5F6F8;
  --rp-text-secondary: #D4D7E2;
  --rp-text-muted: #B9BDCF;
  --rp-text-disabled: #6F768A;

  --rp-primary: #C4522A;
  --rp-primary-hover: #AA3E1D;
  --rp-primary-active: #8E3115;
  --rp-primary-soft: #2B0F06;
  --rp-primary-foreground: #FFFFFF;
  --rp-primary-ambient: rgb(196 82 42 / 0.14);
  --rp-primary-ambient-subtle: rgb(196 82 42 / 0.13);

  --rp-success: #42D392;
  --rp-success-soft: #123A2A;
  --rp-warning: #F5C542;
  --rp-warning-soft: #3A2F12;
  --rp-danger: #FF5C7A;
  --rp-danger-soft: #3A121D;
  --rp-info: #6BA8FF;
  --rp-info-soft: #10233F;

  --rp-video-canvas: #050608;
  --rp-timeline-track: #242A38;
  --rp-timeline-progress: #C4522A;
  --rp-timeline-selection: #DF7652;
  --rp-waveform-muted: #3A4052;
  --rp-waveform-active: #C4522A;
  --rp-crop-frame: #B9BDCF;
  --rp-safe-zone: #C4522A33;

  --rp-radius-xs: 0.25rem;
  --rp-radius-sm: 0.5rem;
  --rp-radius-md: 0.75rem;
  --rp-radius-lg: 1rem;
  --rp-radius-xl: 1.25rem;
  --rp-radius-2xl: 1.5rem;

  --rp-shadow-card: 0 16px 48px rgb(0 0 0 / 0.32);
  --rp-shadow-panel: 0 24px 80px rgb(0 0 0 / 0.40);
  --rp-shadow-modal: 0 32px 120px rgb(0 0 0 / 0.56);
  --rp-shadow-glow: 0 0 32px rgb(196 82 42 / 0.28);
  --rp-shadow-glow-strong: 0 0 56px rgb(196 82 42 / 0.42);

  --rp-transition-fast: 120ms;
  --rp-transition-base: 180ms;
  --rp-transition-slow: 280ms;
}
```

---

## 5. Tailwind CSS v4 Theme Mapping

Use `@theme inline` because the Tailwind theme variables below reference regular CSS custom properties.

```css
@theme inline {
  /* Brand colors */
  --color-rp-bg: var(--rp-bg);
  --color-rp-bg-deep: var(--rp-bg-deep);
  --color-rp-surface: var(--rp-surface);
  --color-rp-surface-elevated: var(--rp-surface-elevated);
  --color-rp-card: var(--rp-card);
  --color-rp-border: var(--rp-border);
  --color-rp-border-strong: var(--rp-border-strong);

  --color-rp-text: var(--rp-text);
  --color-rp-text-secondary: var(--rp-text-secondary);
  --color-rp-text-muted: var(--rp-text-muted);
  --color-rp-text-disabled: var(--rp-text-disabled);

  --color-rp-primary: var(--rp-primary);
  --color-rp-primary-hover: var(--rp-primary-hover);
  --color-rp-primary-active: var(--rp-primary-active);
  --color-rp-primary-soft: var(--rp-primary-soft);
  --color-rp-primary-foreground: var(--rp-primary-foreground);

  --color-rp-success: var(--rp-success);
  --color-rp-success-soft: var(--rp-success-soft);
  --color-rp-warning: var(--rp-warning);
  --color-rp-warning-soft: var(--rp-warning-soft);
  --color-rp-danger: var(--rp-danger);
  --color-rp-danger-soft: var(--rp-danger-soft);
  --color-rp-info: var(--rp-info);
  --color-rp-info-soft: var(--rp-info-soft);

  /* Video/editor colors */
  --color-rp-video-canvas: var(--rp-video-canvas);
  --color-rp-timeline-track: var(--rp-timeline-track);
  --color-rp-timeline-progress: var(--rp-timeline-progress);
  --color-rp-timeline-selection: var(--rp-timeline-selection);
  --color-rp-waveform-muted: var(--rp-waveform-muted);
  --color-rp-waveform-active: var(--rp-waveform-active);
  --color-rp-crop-frame: var(--rp-crop-frame);
  --color-rp-safe-zone: var(--rp-safe-zone);

  /* Radius utilities: rounded-rp-sm, rounded-rp-lg, etc. */
  --radius-rp-xs: var(--rp-radius-xs);
  --radius-rp-sm: var(--rp-radius-sm);
  --radius-rp-md: var(--rp-radius-md);
  --radius-rp-lg: var(--rp-radius-lg);
  --radius-rp-xl: var(--rp-radius-xl);
  --radius-rp-2xl: var(--rp-radius-2xl);

  /* Shadow utilities: shadow-rp-card, shadow-rp-glow, etc. */
  --shadow-rp-card: var(--rp-shadow-card);
  --shadow-rp-panel: var(--rp-shadow-panel);
  --shadow-rp-modal: var(--rp-shadow-modal);
  --shadow-rp-glow: var(--rp-shadow-glow);
  --shadow-rp-glow-strong: var(--rp-shadow-glow-strong);

  /* Font utility: font-sans */
  --font-sans: "Satoshi", "Inter", ui-sans-serif, system-ui, sans-serif;
}
```

This produces utilities such as:

```text
bg-rp-bg
bg-rp-card
text-rp-text
text-rp-primary
border-rp-border
rounded-rp-lg
shadow-rp-card
shadow-rp-glow
font-sans
```

Do not use the old Tailwind v3 pattern of extending these values in `tailwind.config.ts`.

---

## 5.1 Source Detection Rules

Tailwind v4 automatically detects utility classes in normal source files.

For RepurposePro's monorepo, add `@source` only when a shared package is outside automatic detection:

```css
@import "tailwindcss";
@source "../../../packages/ui/src";
@source "../../../packages/shared/src";
```

Do not construct utility class names dynamically:

```tsx
// Bad: Tailwind may not detect the generated class.
<div className={`bg-${status}-500`} />
```

Use complete class strings:

```ts
const statusClasses = {
  completed: "bg-rp-success-soft text-rp-success",
  failed: "bg-rp-danger-soft text-rp-danger",
  processing: "bg-rp-primary-soft text-rp-primary",
} as const;
```

---

## 6. shadcn/ui + Tailwind v4 Token Mapping

Use shadcn/ui semantic variables for reusable component roles. Keep `cssVariables` enabled in `components.json`.

RepurposePro can preserve its exact brand palette in hexadecimal values even though current shadcn v4 starter themes commonly use OKLCH. The important rule is to keep semantic roles stable and map them through `@theme inline`.

Recommended dark semantic variables:

```css
:root {
  --background: #0B0D12;
  --foreground: #F5F6F8;

  --card: #151821;
  --card-foreground: #F5F6F8;

  --popover: #151821;
  --popover-foreground: #F5F6F8;

  --primary: #C4522A;
  --primary-foreground: #FFFFFF;

  --secondary: #1A1D25;
  --secondary-foreground: #E7E9F0;

  --muted: #1A1D25;
  --muted-foreground: #B9BDCF;

  --accent: #2B0F06;
  --accent-foreground: #F5F6F8;

  --destructive: #FF5C7A;
  --destructive-foreground: #F5F6F8;

  --border: #2A3040;
  --input: #2A3040;
  --ring: #C4522A;

  --radius: 0.75rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);

  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);

  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);

  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);

  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);

  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);

  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);

  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);

  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}
```

Use semantic utilities inside generic shadcn-derived primitives:

```text
bg-background
text-foreground
bg-card
text-card-foreground
text-muted-foreground
border-border
ring-ring
```

Use `rp-*` utilities for product-specific visuals:

```text
bg-rp-video-canvas
bg-rp-timeline-track
text-rp-primary
shadow-rp-glow
```

---

## 6.1 Animation Package Rule

For a new Tailwind v4 + shadcn/ui project, do not add the deprecated `tailwindcss-animate` package.

Use the animation package/configuration generated by the current shadcn CLI. When `tw-animate-css` is present, keep its import in the global stylesheet:

```css
@import "tw-animate-css";
```

---

## 7. Typography

## 7.1 Font Family

Recommended font:

```text
Satoshi
```

Fallback stack:

```css
font-family: "Satoshi", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

If Satoshi is unavailable, use Inter.

---

## 7.2 Type Scale

| Token | Size | Line Height | Weight | Usage |
|---|---:|---:|---:|---|
| `display-xl` | 72px | 80px | 700 | Landing hero only |
| `display-lg` | 56px | 64px | 700 | Marketing headers |
| `display-md` | 44px | 52px | 700 | Section hero |
| `heading-xl` | 36px | 44px | 700 | Page title |
| `heading-lg` | 30px | 38px | 700 | Major section |
| `heading-md` | 24px | 32px | 650 | Card/page header |
| `heading-sm` | 20px | 28px | 650 | Panel title |
| `body-lg` | 18px | 28px | 400 | Marketing body |
| `body-md` | 16px | 24px | 400 | Default UI text |
| `body-sm` | 14px | 20px | 400 | Secondary UI text |
| `caption` | 12px | 16px | 500 | Labels, metadata |
| `micro` | 11px | 14px | 600 | Tiny uppercase labels |

---

## 7.3 Typography CSS Variables

```css
:root {
  --rp-font-sans: "Satoshi", "Inter", ui-sans-serif, system-ui, sans-serif;

  --rp-text-display-xl: 4.5rem;
  --rp-text-display-lg: 3.5rem;
  --rp-text-display-md: 2.75rem;

  --rp-text-heading-xl: 2.25rem;
  --rp-text-heading-lg: 1.875rem;
  --rp-text-heading-md: 1.5rem;
  --rp-text-heading-sm: 1.25rem;

  --rp-text-body-lg: 1.125rem;
  --rp-text-body-md: 1rem;
  --rp-text-body-sm: 0.875rem;
  --rp-text-caption: 0.75rem;
  --rp-text-micro: 0.6875rem;
}
```

---

## 7.4 Text Color Usage

| Use | Token |
|---|---|
| Primary headings | `neutral-50` |
| Body text | `neutral-200` |
| Secondary text | `neutral-300` |
| Metadata | `neutral-400` |
| Disabled text | `neutral-500` |
| Primary action text | `neutral-50` |
| Accent text | `ember-300` |

---

## 8. Spacing

Use a 4px spacing scale.

| Token | Value | Tailwind Equivalent |
|---|---:|---|
| `space-0` | 0px | `0` |
| `space-1` | 4px | `1` |
| `space-2` | 8px | `2` |
| `space-3` | 12px | `3` |
| `space-4` | 16px | `4` |
| `space-5` | 20px | `5` |
| `space-6` | 24px | `6` |
| `space-8` | 32px | `8` |
| `space-10` | 40px | `10` |
| `space-12` | 48px | `12` |
| `space-16` | 64px | `16` |
| `space-20` | 80px | `20` |
| `space-24` | 96px | `24` |

---

## 9. Layout Tokens

## 9.1 App Shell

| Token | Value | Usage |
|---|---:|---|
| `sidebar-width` | 264px | Desktop sidebar |
| `topbar-height` | 64px | App topbar |
| `content-max-width` | 1440px | Dashboard content |
| `editor-sidebar-width` | 320px | Clip list/settings panels |
| `editor-preview-width` | 420px | Vertical video preview |
| `billing-card-width` | 320px | Credit pack cards |

---

## 9.2 Page Padding

| Breakpoint | Padding |
|---|---:|
| Mobile | 16px |
| Tablet | 24px |
| Desktop | 32px |
| Large desktop | 40px |

---

## 9.3 Grid Gutters

| Context | Gutter |
|---|---:|
| Dashboard cards | 24px |
| Editor panels | 16px |
| Billing cards | 20px |
| Marketing sections | 32px |
| Brand board/mockup | 12px |

---

## 10. Radius

| Token | Value | Usage |
|---|---:|---|
| `radius-xs` | 4px | Small tags, progress fills |
| `radius-sm` | 8px | Inputs, small buttons |
| `radius-md` | 12px | Cards, dropdowns |
| `radius-lg` | 16px | App panels |
| `radius-xl` | 20px | Large feature cards |
| `radius-2xl` | 24px | Hero panels, video preview shells |
| `radius-full` | 9999px | Pills, avatars, round buttons |

Recommended default:

```text
12px
```

---

## 11. Borders

| Token | Value | Usage |
|---|---|---|
| `border-subtle` | `1px solid #242A38` | Default cards |
| `border-base` | `1px solid #2A3040` | Inputs, panels |
| `border-strong` | `1px solid #42495B` | Active/selected elements |
| `border-accent` | `1px solid #C4522A` | Active selected clips |
| `border-danger` | `1px solid #FF5C7A` | Error fields |

Use subtle borders instead of heavy shadows for most UI separation.

---

## 12. Shadows and Glows

| Token | Value | Usage |
|---|---|---|
| `shadow-card` | `0 16px 48px rgba(0,0,0,.32)` | Elevated cards |
| `shadow-panel` | `0 24px 80px rgba(0,0,0,.40)` | Large panels |
| `shadow-modal` | `0 32px 120px rgba(0,0,0,.56)` | Dialogs |
| `glow-ember` | `0 0 32px rgba(196,82,42,.28)` | Primary CTA glow |
| `glow-ember-strong` | `0 0 56px rgba(196,82,42,.42)` | Hero/brand moments |
| `glow-success` | `0 0 28px rgba(66,211,146,.24)` | Completion states |
| `glow-danger` | `0 0 28px rgba(255,92,122,.24)` | Failure states |

Use glow sparingly. Ember glow should feel premium, not gamer-heavy.

---

## 13. Motion

## 13.1 Durations

| Token | Value | Usage |
|---|---:|---|
| `duration-fast` | 120ms | Hover, small state change |
| `duration-base` | 180ms | Buttons, inputs, tabs |
| `duration-slow` | 280ms | Panels, dialogs |
| `duration-page` | 360ms | Page-level transitions |
| `duration-processing` | 900ms | Ambient processing animation |

---

## 13.2 Easing

| Token | Value | Usage |
|---|---|---|
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default |
| `ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1.2)` | CTA/interactive |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entrances |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exits |

---

## 13.3 Motion Rules

Use motion to clarify state.

Good uses:

- Upload progress
- Processing indicators
- Selected clip state
- Caption drag feedback
- Render progress
- Toasts
- Dialogs

Avoid:

- Excessive looping animations
- Distracting glows
- Animating large video previews unnecessarily
- Hiding important state behind animation

---

## 14. Component Tokens

## 14.1 Button Tokens

### Primary Button

| Property | Token |
|---|---|
| Background | `ember-500` |
| Hover | `ember-600` |
| Active | `ember-700` |
| Text | `neutral-50` |
| Border | transparent |
| Radius | `radius-md` |
| Shadow | optional `glow-ember` |

### Secondary Button

| Property | Token |
|---|---|
| Background | `neutral-800` |
| Hover | `neutral-700` |
| Text | `neutral-100` |
| Border | `neutral-700` |
| Radius | `radius-md` |

### Ghost Button

| Property | Token |
|---|---|
| Background | transparent |
| Hover | `neutral-850` |
| Text | `neutral-300` |
| Active text | `neutral-50` |

### Destructive Button

| Property | Token |
|---|---|
| Background | `danger-soft` |
| Hover | `danger` |
| Text | `danger` or `neutral-50` |
| Border | `danger` |

---

## 14.2 Card Tokens

| Property | Token |
|---|---|
| Background | `neutral-850` |
| Border | `neutral-700` |
| Radius | `radius-lg` |
| Padding | `space-6` |
| Shadow | `shadow-card` only when elevated |

For dense dashboard cards, use `space-4` padding.

---

## 14.3 Input Tokens

| Property | Token |
|---|---|
| Background | `neutral-900` |
| Border | `neutral-700` |
| Border hover | `neutral-600` |
| Border focus | `ember-500` |
| Text | `neutral-50` |
| Placeholder | `neutral-400` |
| Radius | `radius-sm` |
| Height | 40px or 44px |

---

## 14.4 Badge Tokens

| Badge | Background | Text | Border |
|---|---|---|---|
| Default | `neutral-800` | `neutral-300` | `neutral-700` |
| AI | `ember-950` | `ember-200` | `ember-700` |
| Success | `success-soft` | `success` | `success` |
| Warning | `warning-soft` | `warning` | `warning` |
| Danger | `danger-soft` | `danger` | `danger` |
| Info | `info-soft` | `info` | `info` |

---

## 15. Status Tokens

Use consistent status styling across dashboard cards, job screens, and project rows.

| Status | Color Token | Background Token | UI Label |
|---|---|---|---|
| `uploaded` | `info` | `info-soft` | Uploaded |
| `waiting_for_payment` | `warning` | `warning-soft` | Waiting for payment |
| `queued` | `neutral-300` | `neutral-800` | Queued |
| `transcribing` | `ember-300` | `ember-950` | Transcribing |
| `analyzing` | `ember-300` | `ember-950` | Analyzing |
| `preview_ready` | `success` | `success-soft` | Preview ready |
| `waiting_for_user_edits` | `info` | `info-soft` | Waiting for edits |
| `rendering` | `ember-300` | `ember-950` | Rendering |
| `completed` | `success` | `success-soft` | Completed |
| `failed` | `danger` | `danger-soft` | Failed |
| `refunded` | `info` | `info-soft` | Refunded |
| `deleted` | `neutral-500` | `neutral-900` | Deleted |

---

## 16. Processing UI Tokens

## 16.1 Progress Bar

| Property | Token |
|---|---|
| Track | `neutral-800` |
| Fill | `ember-500` |
| Success fill | `success` |
| Failed fill | `danger` |
| Height | 6px |
| Radius | `radius-full` |

---

## 16.2 Processing Step Icon

| State | Style |
|---|---|
| Pending | muted ring, `neutral-600` |
| Active | ember ring, soft glow |
| Completed | success fill |
| Failed | danger fill |
| Refunded | info ring |

---

## 16.3 AI Processing Pattern

Use a subtle animated signal line or waveform.

Tokens:

```css
--rp-ai-line: #C4522A;
--rp-ai-line-muted: #3A4052;
--rp-ai-glow: rgba(123, 97, 255, 0.32);
```

Do not overuse animated patterns outside processing and brand moments.

---

## 17. Preview Editor Tokens

## 17.1 Editor Layout

| Area | Width |
|---|---:|
| Clip list sidebar | 320px |
| Preview canvas | 420px |
| Settings sidebar | 340px |
| Panel gap | 16px |
| Header height | 64px |

---

## 17.2 Video Preview Shell

| Property | Token |
|---|---|
| Background | `video-canvas` |
| Border | `neutral-700` |
| Radius | `radius-2xl` |
| Shadow | `shadow-panel` |
| Aspect ratio | `9 / 16` |
| Safe zone outline | `ember-500` at 20% opacity |

---

## 17.3 Clip List Item

| State | Background | Border | Text |
|---|---|---|---|
| Default | `neutral-850` | `neutral-700` | `neutral-200` |
| Hover | `neutral-800` | `neutral-600` | `neutral-50` |
| Selected | `ember-950` | `ember-500` | `neutral-50` |
| Deleted | `neutral-900` | `neutral-800` | `neutral-500` |
| Rendered | `success-soft` | `success` | `success` |

---

## 17.4 Timeline Tokens

| Property | Token |
|---|---|
| Track | `timeline-track` |
| Selected range | `ember-500` |
| Buffered range | `neutral-700` |
| Playhead | `neutral-50` |
| Trim handles | `ember-300` |
| Waveform inactive | `waveform-muted` |
| Waveform active | `waveform-active` |

---

## 18. Caption Tokens

## 18.1 Caption Preview Style

Default style:

```text
Hormozi-style bold captions
```

The style should feel energetic but still premium.

| Property | Token / Value |
|---|---|
| Font family | Satoshi or Inter |
| Font weight | 800 |
| Text transform | uppercase |
| Fill color | `#F5F6F8` |
| Highlight color | `#C4522A` |
| Stroke color | `#050608` |
| Stroke width | 4px browser equivalent / ASS outline |
| Shadow | `0 4px 18px rgba(0,0,0,.55)` |
| Default position x | 50% |
| Default position y | 72% |
| Default desktop preview size | 48px |
| Default render size | 72px for 1080x1920 |

---

## 18.2 Caption Metadata Tokens

```ts
export const CaptionDefaults = {
  enabled: true,
  style: "hormozi",
  fontFamily: "Satoshi",
  fontWeight: 800,
  fontSizePreview: 48,
  fontSizeRender1080x1920: 72,
  position: {
    x: 0.5,
    y: 0.72,
  },
  fillColor: "#F5F6F8",
  highlightColor: "#C4522A",
  strokeColor: "#050608",
  strokeWidth: 4,
  shadow: "0 4px 18px rgba(0,0,0,.55)",
};
```

---

## 18.3 Caption Safe Zones

Use safe zones to prevent captions from overlapping social platform UI.

| Zone | Value |
|---|---:|
| Top safe margin | 12% |
| Bottom safe margin | 18% |
| Horizontal safe margin | 8% |
| Recommended caption y | 72% |
| Maximum caption y | 80% |
| Minimum caption y | 48% |

---

## 18.4 Caption Highlight Rules

Keyword highlights should use ember.

Recommended:

- Highlight 1–3 words per caption line
- Avoid highlighting entire sentences
- Prefer nouns, verbs, outcomes, and emotional words
- Do not use more than one highlight color in MVP

---

## 19. Upload UI Tokens

## 19.1 Dropzone

| State | Background | Border | Icon |
|---|---|---|---|
| Default | `neutral-900` | dashed `neutral-700` | `neutral-400` |
| Hover | `neutral-850` | dashed `ember-500` | `ember-300` |
| Drag active | `ember-950` | dashed `ember-500` | `ember-300` |
| Error | `danger-soft` | dashed `danger` | `danger` |
| Uploaded | `success-soft` | `success` | `success` |

---

## 19.2 Upload Progress

| Property | Token |
|---|---|
| Track | `neutral-800` |
| Fill | `ember-500` |
| Completed | `success` |
| Failed | `danger` |
| Text | `neutral-300` |

---

## 20. Billing UI Tokens

## 20.1 Credit Balance Card

| Property | Token |
|---|---|
| Background | `neutral-850` |
| Accent | `ember-500` |
| Border | `neutral-700` |
| Number text | `neutral-50` |
| Helper text | `neutral-300` |

---

## 20.2 Credit Pack Card

| State | Background | Border | CTA |
|---|---|---|---|
| Default | `neutral-850` | `neutral-700` | secondary |
| Hover | `neutral-800` | `neutral-600` | primary |
| Recommended | `ember-950` | `ember-500` | primary |
| Selected | `ember-950` | `ember-400` | primary + glow |

---

## 21. Dashboard Tokens

## 21.1 Project Card

| Property | Token |
|---|---|
| Background | `neutral-850` |
| Hover background | `neutral-800` |
| Border | `neutral-700` |
| Active border | `ember-500` |
| Radius | `radius-lg` |
| Padding | `space-5` |

---

## 21.2 Empty State

| Property | Token |
|---|---|
| Icon background | `ember-950` |
| Icon color | `ember-300` |
| Heading | `neutral-50` |
| Body | `neutral-300` |
| CTA | primary button |

---

## 22. Output UI Tokens

## 22.1 Output Card

| Property | Token |
|---|---|
| Background | `neutral-850` |
| Border | `neutral-700` |
| Video background | `video-canvas` |
| Download CTA | primary |
| Delete action | ghost/danger |
| Expiration badge | warning badge when under 24h |

---

## 22.2 Download Button

| State | Style |
|---|---|
| Ready | Primary button |
| Downloading | Primary button with spinner |
| Expired | Disabled |
| Deleted | Disabled ghost |

---

## 23. Iconography

## 23.1 Icon Style

Icons should be:

- Line-based
- Rounded
- Minimal
- 1.5px or 2px stroke
- Consistent with Lucide-style icons

Recommended library:

```text
lucide-react
```

---

## 23.2 Icon Usage

| Feature | Suggested Icons |
|---|---|
| Upload | UploadCloud |
| Clips | Scissors, Clapperboard |
| Summary | FileVideo, AudioWaveform |
| AI | Sparkles |
| Processing | LoaderCircle |
| Credits | Coins, CreditCard |
| Download | Download |
| Delete | Trash |
| Settings | Settings |
| Dashboard | LayoutDashboard |
| Projects | Folder |
| Captions | Captions |
| Regenerate | RefreshCcw |

---

## 24. Z-Index Tokens

| Token | Value | Usage |
|---|---:|---|
| `z-base` | 0 | Base page |
| `z-video` | 10 | Video preview |
| `z-caption` | 20 | Caption overlay |
| `z-controls` | 30 | Video controls |
| `z-header` | 40 | App header |
| `z-sidebar` | 50 | Sidebar |
| `z-dropdown` | 60 | Dropdowns |
| `z-popover` | 70 | Popovers |
| `z-modal` | 80 | Modals |
| `z-toast` | 90 | Toasts |
| `z-tooltip` | 100 | Tooltips |

---

## 25. Breakpoints

Use Tailwind defaults unless there is a strong reason not to.

| Token | Width |
|---|---:|
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |
| `2xl` | 1536px |

MVP editor can be optimized for `lg` and above.

---

## 26. Accessibility Tokens

## 26.1 Focus Ring

| Property | Value |
|---|---|
| Color | `ember-500` |
| Width | 2px |
| Offset | 2px |
| Shadow | `0 0 0 4px rgba(123,97,255,.18)` |

---

## 26.2 Contrast Rules

Minimum contrast targets:

- Body text: WCAG AA
- Buttons: WCAG AA
- Metadata text: acceptable if non-critical
- Error messages: always high contrast
- Captions: use stroke/shadow for video readability

---

## 26.3 Reduced Motion

Respect reduced motion settings.

If user prefers reduced motion:

- Disable ambient glow animations
- Disable looping signal animations
- Keep progress updates functional
- Keep basic transitions under 120ms

Example:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

## 27. Token Exports

## 27.1 TypeScript Token Object

Recommended shared token export:

```ts
export const uiTokens = {
  colors: {
    charcoal: "#0B0D12",
    slate: "#1A1D25",
    graphite: "#11141B",
    panel: "#151821",
    ember: "#C4522A",
    emberSoft: "#DF7652",
    emberDeep: "#8E3115",
    mist: "#B9BDCF",
    white: "#F5F6F8",
    black: "#050608",
    success: "#42D392",
    warning: "#F5C542",
    danger: "#FF5C7A",
    info: "#6BA8FF",
  },
  radius: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    "2xl": "24px",
    full: "9999px",
  },
  motion: {
    fast: "120ms",
    base: "180ms",
    slow: "280ms",
  },
} as const;
```

---

## 27.2 Caption Token Export

```ts
export const captionTokens = {
  defaultStyle: "hormozi",
  fontFamily: "Satoshi",
  fontWeight: 800,
  textTransform: "uppercase",
  fillColor: "#F5F6F8",
  highlightColor: "#C4522A",
  strokeColor: "#050608",
  shadow: "0 4px 18px rgba(0,0,0,.55)",
  position: {
    x: 0.5,
    y: 0.72,
  },
  safeZone: {
    top: 0.12,
    bottom: 0.18,
    horizontal: 0.08,
  },
} as const;
```

---

## 28. Usage Examples

## 28.1 Primary CTA

```tsx
<Button className="bg-rp-primary text-rp-primary-foreground shadow-rp-glow hover:bg-rp-primary-hover">
  New Project
</Button>
```

---

## 28.2 Dashboard Card

```tsx
<Card className="rounded-rp-lg border border-rp-border bg-rp-card shadow-rp-card">
  <CardHeader>
    <CardTitle className="text-rp-text">Podcast Episode 127</CardTitle>
    <CardDescription className="text-rp-text-muted">
      Preview ready
    </CardDescription>
  </CardHeader>
</Card>
```

---

## 28.3 Caption Overlay

```tsx
<div
  className="absolute -translate-x-1/2 -translate-y-1/2 text-center font-extrabold uppercase leading-none text-rp-text"
  style={{
    left: `${caption.position.x * 100}%`,
    top: `${caption.position.y * 100}%`,
    fontSize: caption.fontSize,
    textShadow: "0 4px 18px rgba(0,0,0,.55)",
    WebkitTextStroke: "4px #050608",
  }}
>
  {caption.text}
</div>
```

---

## 29. Do and Do Not

## 29.1 Do

- Use dark surfaces with subtle contrast.
- Use ember for important action and AI states.
- Use clear text hierarchy.
- Use consistent cards and panels.
- Preview captions with CSS before rendering.
- Use status colors consistently.
- Keep the editor clean and focused.
- Make the app feel premium, not noisy.

---

## 29.2 Do Not

- Do not use random colors outside tokens.
- Do not overuse gradients.
- Do not make every element glow.
- Do not use neon green/blue unless needed for status.
- Do not build a playful/cartoonish UI.
- Do not make the editor feel like a complex pro video editor.
- Do not hide processing failures.
- Do not use low-contrast captions on video.

---

## 30. Final Design Rule

RepurposePro should feel like a premium AI production tool for creators.

The UI should communicate:

```text
Upload once. Extract the best moments. Publish everywhere.
```

Every UI decision should support speed, clarity, and trust.
