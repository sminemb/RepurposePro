# RepurposePro Library Docs

## 1. Purpose

This document explains how RepurposePro uses its main libraries and tools.

It is not a replacement for official documentation. Instead, it defines app-specific usage rules so the codebase stays consistent across the frontend, backend, database, queue system, payments, AI pipeline, and video-processing worker.

RepurposePro follows this core implementation principle:

```text
metadata first, render later
```

The app should generate editable preview metadata first, then render final MP4 files only after the user confirms their edits.

---

## 2. Library Overview

| Area | Library / Tool | Purpose in RepurposePro |
|---|---|---|
| Frontend | Next.js | Web app, routing, pages, server/client components |
| Frontend | React | UI composition and state |
| Frontend | shadcn/ui | Reusable UI components |
| Frontend | Tailwind CSS v4 | CSS-first styling, layout, and design tokens |
| Backend | NestJS | API backend and service architecture |
| Database | PostgreSQL | Durable app data |
| Database ORM | Drizzle ORM | Type-safe schema, queries, and migrations |
| Queue | Redis | BullMQ queue backend |
| Queue | BullMQ | Background jobs for processing and rendering |
| Auth | Better Auth | User authentication and sessions |
| Security | Arcjet | Rate limiting and abuse protection |
| Payments | Stripe | Credit purchases and payment webhooks |
| AI | Gemini | Transcript analysis, clip selection, summary selection |
| Transcription | Whisper | Self-hosted speech-to-text |
| Video | FFmpeg / ffprobe | Probing, trimming, cropping, stitching, rendering |
| Captions | ASS subtitles | Styled caption burn-in for final MP4s |
| Validation | Zod or equivalent | Runtime validation for DTOs, AI JSON, and config |

---

## 3. Next.js

## 3.1 Role in RepurposePro

Next.js powers the RepurposePro frontend.

It handles:

- Marketing pages
- Authentication screens
- Dashboard
- Project creation
- Video upload UI
- Billing and credit purchase UI
- Processing status UI
- Clip preview editor
- Summary preview editor
- Output download pages

---

## 3.2 App Router Convention

Use the Next.js App Router.

Recommended routes:

```text
app/
  page.tsx
  login/
  signup/
  dashboard/
  projects/
    page.tsx
    [projectId]/
      page.tsx
      upload/
      processing/
      clips/
      summary/
      outputs/
  billing/
```

---

## 3.3 Server Components vs Client Components

Use Server Components by default.

Use Client Components only when interactivity is required.

Client Components are appropriate for:

- Upload progress
- Video preview player
- Caption dragging
- Trim controls
- Polling job status
- Interactive forms
- Clip selection
- Render/export button states

Keep `"use client"` boundaries small.

Bad:

```tsx
"use client";

export default function ProjectPage() {
  // Entire project page becomes client-side unnecessarily.
}
```

Better:

```tsx
export default async function ProjectPage() {
  return (
    <>
      <ProjectHeader />
      <ClipPreviewEditor />
    </>
  );
}
```

Only `ClipPreviewEditor` needs to be a Client Component.

---

## 3.4 Frontend API Calls

Do not scatter `fetch()` calls everywhere.

Put API calls in feature modules:

```text
features/
  projects/api.ts
  uploads/api.ts
  clips/api.ts
  billing/api.ts
  outputs/api.ts
```

Example:

```ts
export async function getProjectClips(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/clips`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load clips");
  }

  return response.json();
}
```

---

## 3.5 Preview Editor Usage

The preview editor should use browser-based metadata preview.

Use:

- HTML video player
- Timestamp seeking
- CSS overlays
- CSS caption positioning
- Local unsaved state
- Explicit save actions

Do not render MP4 files in the browser.

Final rendering belongs to the backend worker.

---

## 4. React

## 4.1 Role in RepurposePro

React powers the interactive UI.

Use React state for:

- Local form state
- Clip preview state
- Caption position state
- Trim state before saving
- UI toggles
- Optimistic metadata edits when appropriate

Do not use React state as the source of truth for durable project data.

Persist durable edits to the backend.

---

## 4.2 Component Design

Components should be small and focused.

Good component examples:

```text
UploadDropzone
CreditBalanceCard
ClipPreviewCard
CaptionOverlay
TrimControls
RenderButton
JobStatusBadge
OutputDownloadCard
```

Avoid giant components that mix unrelated concerns.

Bad:

```text
ProjectEverythingPage
```

---

## 4.3 Video Preview Component

The video preview component should accept metadata.

Example props:

```ts
type ClipPreviewPlayerProps = {
  sourceUrl: string;
  startTime: number;
  endTime: number;
  captionsEnabled: boolean;
  captionLines: CaptionLine[];
  captionPosition: {
    x: number;
    y: number;
  };
  captionFontSize: number;
};
```

The player should:

- Seek to `startTime`
- Stop or loop at `endTime`
- Show CSS caption overlays
- Keep preview behavior separate from saved backend state

---

## 5. shadcn/ui

## 5.1 Role in RepurposePro

Use shadcn/ui for consistent, accessible UI primitives.

Good uses:

- Buttons
- Cards
- Dialogs
- Dropdowns
- Inputs
- Forms
- Tabs
- Tables
- Toasts
- Progress indicators
- Badges

---

## 5.2 Component Customization

Keep shadcn components close to their original structure.

Do not heavily rewrite primitives unless necessary.

Create feature-specific wrappers when useful:

```text
components/
  ui/
    button.tsx
    card.tsx
    dialog.tsx
  app/
    credit-balance-card.tsx
    processing-status-card.tsx
    clip-preview-card.tsx
```

---

## 5.3 UI Consistency

Use consistent status colors and labels.

Recommended status labels:

```text
Uploaded
Waiting for payment
Queued
Transcribing
Analyzing
Preview ready
Waiting for edits
Rendering
Completed
Failed
Refunded
Deleted
```

The UI should hide internal implementation details from users.

For example, show:

```text
We are transcribing your video.
```

Not:

```text
BullMQ job 891 entered transcribing state.
```

## 5.4 Tailwind v4 Theming with shadcn/ui

Keep `cssVariables` enabled in `components.json`. RepurposePro should use shadcn's semantic variables for common component roles such as `background`, `foreground`, `card`, `primary`, `muted`, `border`, and `ring`.

With Tailwind v4, expose those semantic variables to utilities through `@theme inline`:

```css
:root {
  --background: #0B0D12;
  --foreground: #F5F6F8;
  --card: #151821;
  --card-foreground: #F5F6F8;
  --primary: #C4522A;
  --primary-foreground: #FFFFFF;
  --muted: #1A1D25;
  --muted-foreground: #B9BDCF;
  --border: #2A3040;
  --ring: #C4522A;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
}
```

Use semantic classes such as `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, and `border-border` inside reusable shadcn-style primitives. Use `rp-*` tokens for RepurposePro-specific product visuals such as the video canvas, timeline, waveform, AI glow, and caption system.

---

## 6. Tailwind CSS v4

## 6.1 Role in RepurposePro

Tailwind CSS v4 is used for styling, layout, responsive behavior, and design-token utilities.

Use it for:

- Responsive layouts
- Spacing
- Typography
- Cards
- Forms
- Dashboard UI
- Preview editor layout
- Caption overlay styling
- Status states
- Product-specific tokens such as video canvas, timeline, waveform, and AI accents

---

## 6.2 Installation for Next.js

Use Tailwind v4 through PostCSS.

Install:

```bash
pnpm add -D tailwindcss @tailwindcss/postcss postcss
```

Recommended `postcss.config.mjs`:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

Import Tailwind once in the global stylesheet:

```css
@import "tailwindcss";
```

Do not use the old v3 directives:

```css
/* Do not use for this project. */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 6.3 CSS-First Configuration

Tailwind v4 should be configured primarily in CSS.

Do not create a `tailwind.config.ts` file for ordinary theme customization.

Use `@theme` when a token should create utility classes:

```css
@theme {
  --color-rp-primary: #C4522A;
  --font-sans: "Satoshi", "Inter", ui-sans-serif, system-ui, sans-serif;
  --radius-rp-lg: 1rem;
  --shadow-rp-card: 0 16px 48px rgb(0 0 0 / 0.32);
}
```

This generates utilities such as:

```text
bg-rp-primary
text-rp-primary
border-rp-primary
font-sans
rounded-rp-lg
shadow-rp-card
```

When a Tailwind theme variable references another CSS custom property, use `@theme inline`:

```css
:root {
  --rp-primary: #C4522A;
  --rp-bg: #0B0D12;
}

@theme inline {
  --color-rp-primary: var(--rp-primary);
  --color-rp-bg: var(--rp-bg);
}
```

---

## 6.4 Source Detection

Tailwind v4 automatically detects utility classes in normal project source files.

Do not maintain a v3-style `content` array for normal app code.

For source files in packages that are not detected automatically, use `@source` from the CSS entrypoint:

```css
@import "tailwindcss";
@source "../../../packages/ui/src";
```

Only add explicit sources when needed.

---

## 6.5 Do Not Build Dynamic Class Names

Tailwind scans source files as plain text. Do not construct class names from fragments.

Bad:

```tsx
<div className={`bg-${status}-500`} />
```

Good:

```ts
const statusClasses = {
  completed: "bg-rp-success-soft text-rp-success",
  failed: "bg-rp-danger-soft text-rp-danger",
  processing: "bg-rp-primary-soft text-rp-primary",
} as const;
```

```tsx
<div className={statusClasses[status]} />
```

All possible utility classes should appear as complete strings in source code unless they are safelisted or emitted through another supported mechanism.

---

## 6.6 Styling Rules

Prefer:

- Design tokens through `@theme` and `@theme inline`
- shadcn semantic variables for reusable primitives
- RepurposePro-specific theme variables for product visuals
- Complete static utility class strings
- Consistent spacing and component composition

Avoid:

- Random one-off colors
- V3-style JavaScript theme extension for ordinary token setup
- Dynamic utility fragments
- Hardcoded layout hacks
- Inline styles for static layout

Inline styles are acceptable for genuinely runtime-driven values such as user-controlled caption coordinates or font sizes:

```tsx
<div
  className="absolute -translate-x-1/2 -translate-y-1/2 text-center font-bold"
  style={{
    left: `${captionPosition.x * 100}%`,
    top: `${captionPosition.y * 100}%`,
    fontSize: `${captionFontSize}px`,
  }}
>
  {captionText}
</div>
```

---

## 6.7 Responsive Design

The editor should work best on desktop first.

For MVP:

- Dashboard should be responsive.
- Billing should be responsive.
- Upload should be responsive.
- Preview editor can be desktop-first.

Use Tailwind's default responsive variants unless the product needs a deliberate custom breakpoint. If a custom breakpoint is needed, define it as a `--breakpoint-*` theme variable.

A full mobile video editor is deferred.

---

## 6.8 Animation Utilities

For shadcn/ui with Tailwind v4, prefer the animation setup generated by the current shadcn CLI. Do not add the deprecated `tailwindcss-animate` package to a new project.

If the project uses `tw-animate-css`, import it from the global stylesheet according to the generated shadcn setup:

```css
@import "tw-animate-css";
```

Keep third-party CSS imports centralized and documented.

---

## 7. NestJS

## 7.1 Role in RepurposePro

NestJS powers the backend API.

It handles:

- Auth integration
- Project APIs
- Upload APIs
- Billing APIs
- Credit ledger logic
- Queue orchestration
- Clip metadata APIs
- Summary metadata APIs
- Output download authorization
- Worker coordination
- Cleanup scheduling

---

## 7.2 Module Structure

Organize modules by domain.

Recommended modules:

```text
auth
users
projects
uploads
billing
credits
jobs
clips
summary
outputs
webhooks
storage
```

Example:

```text
src/
  modules/
    projects/
      projects.controller.ts
      projects.service.ts
      projects.module.ts
    billing/
      billing.controller.ts
      billing.service.ts
      stripe-webhook.controller.ts
      billing.module.ts
```

---

## 7.3 Controller Rules

Controllers should be thin.

Controllers should:

- Validate request input
- Require auth
- Check authorization
- Call services
- Return response DTOs

Controllers should not:

- Deduct credits directly
- Run FFmpeg
- Run Whisper
- Call Gemini directly
- Build complex SQL queries
- Contain long business workflows

---

## 7.4 Service Rules

Services own business logic.

Examples:

```text
ProjectsService.createProject
CreditsService.deductCreditsForProcessing
CreditsService.refundCreditsForFailedJob
JobsService.queueAnalysisJob
ClipsService.updateClipMetadata
OutputsService.createDownloadUrl
```

Use transactions for critical multi-step operations.

---

## 7.5 Guards and Authorization

Every project-scoped endpoint must verify ownership.

A user can only access:

- Their own projects
- Their own uploads
- Their own clips
- Their own summary segments
- Their own outputs
- Their own billing history

Do not rely on frontend filtering for security.

---

## 8. PostgreSQL

## 8.1 Role in RepurposePro

PostgreSQL stores durable application state.

It should store:

- Users
- Projects
- Upload metadata
- Job metadata
- Transcript metadata
- Clip metadata
- Summary metadata
- Rendered output metadata
- Credit ledger
- Stripe payment records

It should not store large video files directly.

Store files on disk or object storage and save paths/keys in Postgres.

---

## 8.2 Naming Conventions

Use snake_case for tables and columns.

Examples:

```text
uploaded_videos
processing_jobs
clip_candidates
credit_ledger
created_at
updated_at
project_id
```

---

## 8.3 File Retention Fields

Tables related to stored files should include:

```text
storage_path
expires_at
deleted_at
```

The cleanup system uses these fields to delete files after 7 days.

---

## 8.4 Credit Ledger Requirement

Never store only a balance.

Store every credit event in `credit_ledger`.

Credit transaction examples:

```text
purchase
processing_deduction
refund
manual_adjustment
expiration_adjustment
```

---

## 9. Drizzle ORM

## 9.1 Role in RepurposePro

Drizzle ORM provides:

- Type-safe database schema
- Type-safe queries
- Migrations
- Transaction support

---

## 9.2 Schema Organization

Recommended structure:

```text
packages/db/
  src/
    schema/
      users.ts
      projects.ts
      uploaded-videos.ts
      processing-jobs.ts
      transcripts.ts
      clip-candidates.ts
      summary-segments.ts
      rendered-outputs.ts
      credit-ledger.ts
      stripe.ts
    client.ts
    migrations/
```

---

## 9.3 Query Rules

Keep queries close to domain services.

Use repository-style helpers only when they reduce duplication.

Avoid hiding important business logic inside generic database helpers.

---

## 9.4 Transactions

Use Drizzle transactions for:

- Stripe payment record + credit purchase
- Credit deduction + ledger entry + job creation
- Credit refund + job update
- Render output creation + job completion
- Project deletion + metadata updates

Example concept:

```ts
await db.transaction(async (tx) => {
  await tx.insert(creditLedger).values(...);
  await tx.update(users).set(...);
  await tx.insert(processingJobs).values(...);
});
```

---

## 9.5 Migrations

All schema changes require migrations.

Migration names should be descriptive:

```text
0001_initial_schema.sql
0002_add_credit_ledger.sql
0003_add_clip_candidates.sql
0004_add_rendered_outputs.sql
```

---

## 10. Redis

## 10.1 Role in RepurposePro

Redis supports BullMQ.

It stores:

- Queued jobs
- Job status
- Retry metadata
- Delayed cleanup jobs
- Worker coordination data

Redis is not the durable source of truth for business state.

Postgres remains the durable source of truth.

---

## 10.2 Redis Usage Rules

Use Redis for queue infrastructure only.

Do not store permanent project state only in Redis.

If Redis is lost, the system should be able to reconcile important job state from Postgres.

---

## 11. BullMQ

## 11.1 Role in RepurposePro

BullMQ handles background processing.

Use it for:

- Video analysis jobs
- Clip rendering jobs
- Summary rendering jobs
- Clip regeneration jobs
- File cleanup jobs

---

## 11.2 Recommended Queues

```text
video-analysis-queue
video-render-queue
cleanup-queue
```

---

## 11.3 Recommended Job Types

```text
analyze_video
render_clips
render_summary
regenerate_clip_candidate
cleanup_expired_project_files
```

---

## 11.4 Job Payload Rules

Job payloads should contain IDs, not full data blobs.

Good:

```json
{
  "projectId": "project_123",
  "userId": "user_123",
  "uploadedVideoId": "video_123"
}
```

Bad:

```json
{
  "fullTranscript": "...",
  "largeMetadata": {}
}
```

The worker should load required data from Postgres/storage.

---

## 11.5 Retry Rules

Recommended retries:

```text
Whisper transcription: 1 retry
Gemini analysis: 2 retries
FFmpeg render: 1 retry
Cleanup: 3 retries
```

Retries must be safe.

A retried job must not:

- Deduct credits twice
- Create duplicate outputs
- Corrupt metadata
- Delete files prematurely

---

## 12. Better Auth

## 12.1 Role in RepurposePro

Better Auth handles user authentication.

Use it for:

- Signup
- Login
- Sessions
- Authenticated API access
- Protected dashboard routes

---

## 12.2 Auth Rules

Require authentication for:

- Project creation
- Uploads
- Credit purchases
- Starting processing
- Viewing previews
- Editing clips
- Rendering outputs
- Downloading files
- Deleting projects

---

## 12.3 User Ownership

Better Auth identifies the user.

The backend must still enforce ownership checks.

Example rule:

```text
Authenticated user ID must match project.user_id.
```

---

## 13. Arcjet

## 13.1 Role in RepurposePro

Arcjet protects the app from abuse.

Use it for:

- Signup protection
- Login rate limits
- Upload rate limits
- Processing endpoint limits
- Render endpoint limits
- Billing endpoint protection
- Bot protection

---

## 13.2 Suggested Protection Points

Protect:

```text
POST /signup
POST /login
POST /projects
POST /projects/:projectId/upload
POST /projects/:projectId/analyze
POST /projects/:projectId/render
POST /billing/checkout
```

---

## 13.3 Upload Abuse Rules

Uploads are expensive.

Enforce:

- Max file size: 500 MB
- MVP max duration: 30 minutes
- Max concurrent processing jobs per user
- Rate limits on upload attempts
- Rate limits on processing attempts

---

## 14. Stripe

## 14.1 Role in RepurposePro

Stripe handles payments for credit packs.

RepurposePro should use:

- Stripe Checkout
- Stripe webhooks
- Stripe customer IDs
- Stripe payment records

---

## 14.2 Credit Pack Model

Recommended credit packs:

| Pack | Price | Credits |
|---|---:|---:|
| Starter | $10 | 40 |
| Creator | $25 | 100 |
| Pro | $50 | 200 |

Rules:

```text
1 credit = 1 video minute
```

Round up partial minutes.

Example:

```text
10.2 minutes = 11 credits
```

---

## 14.3 Payment Flow

```text
User selects credit pack
  -> Backend creates Stripe Checkout session
  -> User pays in Stripe Checkout
  -> Stripe sends webhook
  -> Backend verifies webhook signature
  -> Backend records payment
  -> Backend adds credits through credit ledger
```

---

## 14.4 Webhook Rules

Stripe webhook handlers must:

- Verify signature
- Be idempotent
- Store processed event IDs
- Never grant credits twice
- Handle duplicate events safely
- Return success for already-processed valid events

---

## 14.5 Refund Policy

For normal processing failures, refund credits.

Do not automatically refund Stripe payments unless you intentionally want to return money to the user.

Credit refund example:

```text
processing failed -> add refund ledger entry -> user receives credits back
```

---

## 15. Gemini

## 15.1 Role in RepurposePro

Gemini analyzes transcripts.

It should be used for:

- Clip selection
- Clip scoring
- Clip titles
- Clip reasons
- Keyword highlights
- Summary segment selection
- Backup candidate generation

---

## 15.2 Model Usage

Recommended MVP usage:

| Task | Model |
|---|---|
| Transcript cleanup | Gemini Flash-Lite |
| Initial clip candidate scoring | Gemini Flash-Lite |
| Final clip ranking | Gemini Flash |
| Summary segment selection | Gemini Flash |
| Regenerate one clip | Flash-Lite first, Flash fallback |

Use the exact model names from the current Gemini API docs at implementation time.

---

## 15.3 Send Transcript, Not Raw Video

For MVP, send Gemini timestamped transcripts, not raw video.

This keeps the system:

- Cheaper
- Faster
- Easier to debug
- Easier to validate
- Less dependent on video-model behavior

---

## 15.4 Structured JSON Output

Gemini should return structured JSON.

Example clip output:

```json
{
  "clips": [
    {
      "title": "Why Most Creators Burn Out",
      "startTime": 412.5,
      "endTime": 486.2,
      "score": 92,
      "reason": "Strong hook, useful insight, and clear emotional delivery.",
      "captionHighlights": ["burn out", "consistency", "systems"],
      "transcriptExcerpt": "..."
    }
  ],
  "backupCandidates": []
}
```

Example summary output:

```json
{
  "summarySegments": [
    {
      "startTime": 120.0,
      "endTime": 185.4,
      "reason": "Introduces the main topic and gives necessary context."
    }
  ],
  "targetDurationSeconds": 180
}
```

---

## 15.5 Validation Rules

Validate Gemini output before saving.

Check:

- Valid JSON
- Required fields exist
- Start time is within video duration
- End time is within video duration
- End time is after start time
- Clip duration is reasonable
- Summary segments are chronological
- Scores are within expected range
- No duplicate clips with nearly identical timestamps

If Gemini output fails validation:

1. Try a repair prompt.
2. Retry if needed.
3. Fail gracefully if still invalid.
4. Refund credits if no usable preview result is produced.

---

## 15.6 Prompt Versioning

Prompts should be versioned in code.

Recommended structure:

```text
packages/shared/src/prompts/
  clip-selection.prompt.v1.ts
  summary-selection.prompt.v1.ts
  clip-regeneration.prompt.v1.ts
```

Store the prompt version used for each job.

This helps debug why a clip or summary was generated.

---

## 16. Whisper

## 16.1 Role in RepurposePro

Whisper provides self-hosted speech-to-text transcription.

It should produce:

- Full transcript
- Segment timestamps
- Word-level timestamps if feasible
- Language detection or English confirmation
- Confidence scores if available

---

## 16.2 MVP Language Rule

RepurposePro MVP supports English only.

If Whisper detects non-English content, the app should fail gracefully or show an unsupported-language message.

---

## 16.3 Audio Extraction

Before running Whisper, extract audio with FFmpeg.

Recommended format:

```text
mono WAV
16 kHz
```

Example conceptual command:

```text
ffmpeg -i input.mp4 -ac 1 -ar 16000 audio.wav
```

Use safe process APIs and pass arguments as an array, not a shell-concatenated string.

---

## 16.4 Transcript Format

Store the transcript as JSON.

Example:

```json
{
  "language": "en",
  "duration": 1800.0,
  "segments": [
    {
      "start": 0.0,
      "end": 4.2,
      "text": "Welcome back to the show."
    }
  ]
}
```

---

## 16.5 Word-Level Timestamps

Word-level timestamps are preferred for high-quality captions.

If they are too slow for MVP, use segment-level or phrase-level timestamps first.

The caption system should be designed so word-level timing can be added later.

---

## 17. FFmpeg and ffprobe

## 17.1 Role in RepurposePro

FFmpeg handles final video processing.

Use ffprobe for:

- Duration
- Width
- Height
- FPS
- Codecs
- Audio stream existence

Use FFmpeg for:

- Audio extraction
- Clip trimming
- Vertical cropping
- Caption burn-in
- Summary stitching
- MP4 encoding
- Thumbnail extraction if needed

---

## 17.2 Probe Before Processing

Every uploaded video should be probed before processing.

Reject or fail gracefully if:

- File is corrupted
- No audio stream exists
- Duration exceeds MVP limit
- File cannot be decoded
- Video dimensions are unsupported

---

## 17.3 Safe Command Execution

Never build shell commands with user input.

Bad:

```ts
exec(`ffmpeg -i ${inputPath} ${outputPath}`);
```

Better:

```ts
spawn("ffmpeg", ["-i", inputPath, outputPath]);
```

Use generated internal filenames.

Do not pass original user filenames directly into shell commands.

---

## 17.4 Rendering Strategy

Render only after the user clicks Render or Export.

For clips:

```text
source video
  -> trim selected range
  -> crop to vertical
  -> burn captions if enabled
  -> encode MP4
```

For summary:

```text
source video
  -> trim selected chronological segments
  -> concatenate segments
  -> preserve original audio
  -> encode MP4
```

---

## 17.5 Output Settings

Use reasonable MP4 defaults for social video.

Recommended target:

```text
Format: MP4
Video codec: H.264
Audio codec: AAC
Aspect ratio: 9:16 for clips
Resolution: 1080x1920 if source supports it
```

For MVP, prioritize reliability over perfect compression.

---

## 18. ASS Subtitles

## 18.1 Role in RepurposePro

ASS subtitles are used for styled caption burn-in.

They are better than SRT for:

- Font size
- Text position
- Styling
- Keyword highlighting
- Hormozi-style captions

---

## 18.2 Caption Preview vs Render

Browser preview:

```text
React + CSS overlay
```

Final render:

```text
ASS subtitle file + FFmpeg burn-in
```

The browser preview and FFmpeg output should match as closely as possible, but perfect parity is not required for MVP.

---

## 18.3 Caption Metadata

Store caption metadata as JSON.

Example:

```json
{
  "enabled": true,
  "style": "hormozi",
  "fontSize": 64,
  "position": {
    "x": 0.5,
    "y": 0.72
  },
  "lines": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "Most creators burn out because they lack systems.",
      "highlights": ["burn out", "systems"]
    }
  ]
}
```

---

## 18.4 Caption Rendering Rules

For MVP:

- Use one default Hormozi-style preset.
- Allow caption on/off.
- Allow caption position changes.
- Allow font size changes.
- Allow text edits.
- Auto-highlight keywords from Gemini.
- Burn captions into final MP4.

Do not build multiple caption templates in MVP.

---

## 19. Face Detection Library

## 19.1 Role in RepurposePro

Face detection is used to create face-aware vertical crop metadata.

The MVP does not require dynamic active-speaker switching.

---

## 19.2 MVP Behavior

The worker should:

- Sample frames from the source video
- Detect visible faces
- Estimate a stable vertical crop
- Smooth crop position across sampled frames
- Store crop metadata
- Fall back to center crop if detection fails

---

## 19.3 Crop Metadata

Example:

```json
{
  "mode": "face_aware",
  "x": 420,
  "y": 0,
  "width": 1080,
  "height": 1920,
  "fallback": false
}
```

If face detection fails:

```json
{
  "mode": "center_crop",
  "fallback": true
}
```

---

## 20. Zod or Runtime Validation

## 20.1 Role in RepurposePro

Use runtime validation for data that TypeScript cannot guarantee at runtime.

Validate:

- API request bodies
- Environment variables
- Stripe webhook payload assumptions
- BullMQ job payloads
- Gemini JSON output
- Caption metadata
- Clip metadata updates

---

## 20.2 Validation Rule

TypeScript types are not enough for external data.

Use schema validation at system boundaries.

Example:

```ts
const ClipCandidateSchema = z.object({
  title: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  score: z.number().min(0).max(100),
  reason: z.string(),
});
```

---

## 21. Environment Variables

## 21.1 Required Config

RepurposePro should validate environment variables at startup.

Possible variables:

```text
DATABASE_URL
REDIS_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL
ARCJET_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER
STRIPE_PRICE_CREATOR
STRIPE_PRICE_PRO
GEMINI_API_KEY
STORAGE_ROOT
WORKER_INTERNAL_TOKEN
APP_URL
API_URL
MAX_UPLOAD_SIZE_MB
MAX_VIDEO_DURATION_SECONDS
FILE_RETENTION_DAYS
```

---

## 21.2 Config Rules

Do not hardcode:

- API URLs
- Storage paths
- Stripe price IDs
- Upload limits
- Retention days
- Gemini model names
- Redis URLs

Use configuration.

Fail fast if required configuration is missing.

---

## 22. Library Usage by Feature

## 22.1 Upload Feature

Uses:

- Next.js for upload UI
- shadcn/ui for upload components
- NestJS for upload endpoint
- Arcjet for upload abuse protection
- FFmpeg/ffprobe for metadata validation
- Postgres/Drizzle for upload records
- File storage for source video

---

## 22.2 Billing Feature

Uses:

- Next.js for billing UI
- Stripe Checkout for payment
- NestJS for checkout session creation
- Stripe webhooks for payment confirmation
- Postgres/Drizzle for payment records
- Credit ledger for credit history

---

## 22.3 Processing Feature

Uses:

- NestJS to create processing jobs
- BullMQ for background queues
- Redis as queue backend
- Local worker for heavy processing
- FFmpeg for audio extraction
- Whisper for transcription
- Gemini for analysis
- Postgres/Drizzle for job and metadata records

---

## 22.4 Preview Editor Feature

Uses:

- Next.js and React for UI
- HTML video player for previews
- Tailwind CSS for layout
- CSS overlays for captions
- NestJS APIs for saving metadata
- Postgres/Drizzle for clip and summary metadata

---

## 22.5 Rendering Feature

Uses:

- NestJS to create render jobs
- BullMQ for render queue
- Local worker for rendering
- FFmpeg for trimming/cropping/encoding
- ASS subtitles for caption burn-in
- File storage for rendered MP4s
- Postgres/Drizzle for output records

---

## 22.6 Cleanup Feature

Uses:

- BullMQ delayed or scheduled cleanup jobs
- Worker file deletion logic
- Postgres `expires_at` and `deleted_at` fields
- Storage path records

---

## 23. Implementation Rules Summary

Follow these rules across all library usage:

1. Use Next.js for UI, not heavy processing.
2. Use NestJS for orchestration, not transcription/rendering.
3. Use BullMQ for long-running work.
4. Use Postgres as the durable source of truth.
5. Use Redis only for queues and temporary coordination.
6. Use Drizzle transactions for credits, payments, jobs, and outputs.
7. Use Stripe only for buying credits.
8. Refund normal processing failures with credits, not money.
9. Use Whisper for transcription.
10. Use Gemini for transcript analysis, not raw video analysis.
11. Use FFmpeg for final rendering only.
12. Use browser metadata previews before rendering.
13. Use ASS subtitles for final styled captions.
14. Use Arcjet to protect expensive endpoints.
15. Validate all external and AI-generated data.
16. Keep MVP to one output style.
17. Avoid building a full video editor in the first version.

---

## 24. Library Activation by Vertical Slice

Libraries should be introduced when a vertical slice first needs them, rather than integrating the entire stack upfront.

| Slice | Libraries / Tools First Activated | Why |
|---|---|---|
| VS0 | Next.js, Tailwind CSS v4, shadcn/ui, NestJS, PostgreSQL, Drizzle, Redis | Boot the repository and shared infrastructure |
| VS1 | Better Auth | Deliver signup, login, logout, sessions, and protected dashboard |
| VS2 | FFmpeg/ffprobe, local file storage | Validate uploaded video and calculate duration-based credit cost |
| VS3 | Stripe, BullMQ | Buy credits, safely deduct them, and enqueue processing |
| VS4 | Self-hosted Whisper, Gemini | Produce transcript and AI-selected clip-preview metadata |
| VS5 | React browser video preview, CSS caption overlay | Edit preview metadata without rendering MP4s |
| VS6 | ASS subtitles, FFmpeg rendering | Render one final vertical MP4 and burn styled captions |
| VS7 | Gemini regeneration fallback, multi-render queue behavior | Replace bad clips and render selected outputs only |
| VS8 | Gemini summary prompt + FFmpeg concatenation | Produce condensed chronological summary video |
| VS9 | Existing Drizzle transaction and queue primitives | Make failure refunds idempotent across worker/API boundaries |
| VS10 | BullMQ cleanup jobs + storage deletion | Enforce 7-day file retention |
| VS11 | Arcjet | Harden expensive endpoints and abuse-sensitive flows |
| VS12 | Test tooling and visual/responsive verification | Validate the complete MVP and demo flow |

Rules:

- Do not integrate a library merely because it appears in the stack.
- A library should enter the codebase when a current vertical slice requires it.
- The exception is VS0, which establishes the minimum bootable platform.
- Keep `build-plan.md` and `progress-tracker.md` aligned with this activation order.


---

## 25. Final Note

RepurposePro depends on many powerful libraries, but the MVP should stay simple.

The most important architectural rule is:

```text
Do expensive work only when needed.
```

That means:

- Generate metadata before video files.
- Preview in the browser before rendering.
- Render only selected outputs.
- Deduct credits before processing.
- Refund credits when processing fails.
- Delete files after 7 days.

This keeps RepurposePro cheaper, faster, and easier to build.
