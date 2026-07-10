# RepurposePro UI Registry

## 1. Purpose

This document defines the reusable UI component registry for **RepurposePro**.

It answers:

- Which reusable UI components exist?
- Where should each component live?
- What variants and states does each component support?
- Which components are global?
- Which components are feature-specific?
- How should each component behave responsively?
- Which components may wrap shadcn/ui primitives?
- Which states must be represented consistently?

This registry works together with:

```text
project-overview.md
architecture.md
code-standards.md
library-docs.md
ui-tokens.md
ui-rules.md
ui-registry.md
```

Responsibilities:

```text
ui-tokens.md    -> visual values
ui-rules.md     -> behavior and UX rules
ui-registry.md  -> reusable UI components and contracts
```

---

## 2. Registry Principles

## 2.1 Prefer Reusable Components

Create reusable components when:

- The UI appears in more than one place.
- The component has meaningful variants.
- The component owns repeated behavior.
- The component represents a product-specific concept.
- The component benefits from centralized accessibility rules.

Do not create abstractions for one-off wrappers with no reusable behavior.

---

## 2.2 Use shadcn/ui as Primitive Infrastructure

Use shadcn/ui for low-level primitives such as:

```text
Button
Input
Textarea
Select
Dialog
DropdownMenu
Tooltip
Tabs
Badge
Card
Progress
Skeleton
Table
Sheet
Popover
```

RepurposePro-specific components should compose these primitives.

Example:

```text
CreditBalanceCard
  -> Card
  -> Badge
  -> Button
```

---

## 2.3 Keep Domain Logic Out of Generic Primitives

Do not put RepurposePro business rules into:

```text
components/ui/button.tsx
components/ui/card.tsx
components/ui/dialog.tsx
```

Business-specific behavior belongs in:

```text
components/app/
features/<feature>/components/
```

---

## 2.4 Component Naming

Use PascalCase for React component names.

Examples:

```text
ProjectCard
ClipPreviewPlayer
CreditBalanceCard
ProcessingStepList
```

Use kebab-case for filenames.

Examples:

```text
project-card.tsx
clip-preview-player.tsx
credit-balance-card.tsx
processing-step-list.tsx
```

---

## 3. Recommended Component Ownership

## 3.1 Primitive Components

Location:

```text
apps/web/components/ui/
```

Contains mostly shadcn/ui primitives.

Examples:

```text
button.tsx
input.tsx
textarea.tsx
select.tsx
dialog.tsx
dropdown-menu.tsx
tooltip.tsx
tabs.tsx
badge.tsx
card.tsx
progress.tsx
skeleton.tsx
table.tsx
sheet.tsx
popover.tsx
```

---

## 3.2 Shared App Components

Location:

```text
apps/web/components/app/
```

Use for components shared across multiple domains.

Examples:

```text
app-sidebar.tsx
app-topbar.tsx
page-header.tsx
empty-state.tsx
error-state.tsx
loading-state.tsx
confirmation-dialog.tsx
status-badge.tsx
expiration-badge.tsx
```

---

## 3.3 Feature Components

Location:

```text
apps/web/features/<feature>/components/
```

Recommended features:

```text
projects
upload
billing
processing
clips
summary
outputs
settings
```

Examples:

```text
features/projects/components/project-card.tsx
features/upload/components/upload-dropzone.tsx
features/clips/components/clip-preview-card.tsx
features/billing/components/credit-pack-card.tsx
```

---

## 4. Primitive UI Components

## 4.1 Button

Source:

```text
shadcn/ui
```

Location:

```text
components/ui/button.tsx
```

Purpose:

- Primary actions
- Secondary actions
- Ghost actions
- Destructive actions

Variants:

```text
primary
secondary
ghost
destructive
outline
link
```

Sizes:

```text
sm
md
lg
icon
```

States:

```text
default
hover
active
focus
disabled
loading
```

Rules:

- Use one primary CTA in the main action area.
- Use explicit labels.
- Use destructive styling only for destructive actions.
- Loading buttons must keep stable width when practical.
- Disabled buttons should explain why when the reason is not obvious.

Examples:

```text
New Project
Start Processing
Render Selected Clips
Download MP4
Delete Project
```

---

## 4.2 Input

Source:

```text
shadcn/ui
```

Purpose:

- Text input
- Number input
- Time input
- Project naming
- Search

States:

```text
default
focus
error
disabled
read-only
```

Rules:

- Always use labels.
- Do not rely only on placeholders.
- Show validation inline.
- Preserve entered values after validation failures.

---

## 4.3 Textarea

Purpose:

- Caption text editing
- Optional user notes later

Primary use in MVP:

```text
CaptionEditor
```

Rules:

- Autosize when useful.
- Keep character count optional.
- Show unsaved state when appropriate.

---

## 4.4 Select

Purpose:

- Output type
- Clip count
- Caption font size preset
- Caption position preset

Avoid using Select when only two choices exist.

For two choices, use:

```text
RadioGroup
SegmentedControl
Tabs
```

---

## 4.5 Dialog

Purpose:

- Delete confirmation
- Credit deduction confirmation
- Failed-job refund details
- Destructive actions

Rules:

- Do not use dialogs for normal navigation.
- Default focus should not land on destructive action.
- Escape closes the dialog.
- Include explicit cancel action.

---

## 4.6 Tooltip

Purpose:

- Explain icons
- Explain disabled controls
- Clarify technical metadata

Avoid putting critical information only inside tooltips.

---

## 4.7 Badge

Purpose:

- Status
- AI indicator
- Output type
- Expiration
- Payment state

Variants:

```text
default
ai
success
warning
danger
info
muted
```

---

## 4.8 Card

Purpose:

- Project cards
- Credit packs
- Output cards
- Status cards
- Metadata cards

Rules:

- Avoid card nesting when possible.
- Use consistent radius and spacing.
- Use subtle borders.
- Use shadows only for real elevation.

---

## 4.9 Progress

Purpose:

- Upload progress
- Processing progress
- Render progress

Variants:

```text
default
success
danger
```

Rules:

- Do not imply precision you do not actually have.
- Prefer step-based progress when exact percentage is unknown.

---

## 4.10 Skeleton

Purpose:

- Project list loading
- Output cards loading
- Billing history loading
- Clip list loading

Use skeletons for content that will appear in place.

Do not use skeletons for background processing status.

---

## 4.11 Table

Purpose:

- Credit ledger
- Payment history
- Optional project list on desktop

Rules:

- Must remain readable on smaller screens.
- Convert to cards or horizontally scroll when necessary.
- Avoid overly dense tables in MVP.

---

## 4.12 Sheet

Purpose:

- Mobile navigation
- Compact settings panels
- Clip settings on smaller widths

Use sparingly.

---

## 4.13 Popover

Purpose:

- Caption position presets
- Highlight keyword selection
- Compact metadata controls

Avoid hiding major workflow controls inside popovers.

---

## 5. Shared App Components

## 5.1 AppSidebar

Location:

```text
components/app/app-sidebar.tsx
```

Purpose:

Primary authenticated navigation.

Items:

```text
Dashboard
New Project
Billing
Settings
```

States:

```text
expanded
collapsed
mobile sheet
```

Responsive behavior:

```text
mobile: hidden behind menu/sheet
tablet: collapsed or compact
desktop: persistent
large desktop: persistent
```

Rules:

- Show active route.
- Keep credit balance shortcut optional.
- Do not include project-specific editing controls.

---

## 5.2 AppTopbar

Purpose:

- Page context
- User menu
- Credit balance
- Mobile menu trigger

Contents:

```text
page title
credit balance shortcut
user avatar/menu
mobile sidebar trigger
```

Responsive behavior:

```text
mobile: compact
tablet: compact
desktop: full
```

---

## 5.3 PageHeader

Purpose:

Reusable title area for app pages.

Props:

```ts
type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
};
```

Use on:

```text
Dashboard
Billing
Settings
Outputs
```

---

## 5.4 EmptyState

Purpose:

Show empty content with guidance.

Props:

```ts
type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
};
```

Examples:

```text
No projects yet.
No rendered outputs yet.
No billing transactions yet.
```

---

## 5.5 ErrorState

Purpose:

Show recoverable and non-recoverable failures.

Props:

```ts
type ErrorStateProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
  code?: string;
};
```

Rules:

- Use human-readable messages.
- Do not expose stack traces.
- Technical codes may be shown only if useful for support.

---

## 5.6 LoadingState

Purpose:

Simple full-panel loading state.

Use only when skeletons are not appropriate.

Avoid full-screen loading unless necessary.

---

## 5.7 ConfirmationDialog

Purpose:

Standardized confirmation for destructive or costly actions.

Props:

```ts
type ConfirmationDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
};
```

Use for:

```text
Delete project
Delete output
Delete source video
Start credit-charged processing
```

---

## 5.8 StatusBadge

Purpose:

Map internal job status to consistent user-facing labels and styles.

Supported statuses:

```text
uploaded
waiting_for_payment
queued
transcribing
analyzing
preview_ready
waiting_for_user_edits
rendering
completed
failed
refunded
deleted
```

Rules:

- Never display raw internal values.
- Always use consistent wording across app.

---

## 5.9 ExpirationBadge

Purpose:

Show file expiration state.

Variants:

```text
normal
warning
urgent
expired
```

Examples:

```text
Expires in 7 days
Expires tomorrow
Expires in 3 hours
Expired
```

Rules:

- Use warning styling under 24 hours.
- Do not show a working download button after expiration.

---

## 6. Dashboard Components

## 6.1 ProjectCard

Location:

```text
features/projects/components/project-card.tsx
```

Purpose:

Show a project summary.

Displays:

```text
project name
output type
status
created date
expiration date
clip/output count
continue action
```

Variants:

```text
clips
summary
```

States:

```text
active
processing
preview_ready
completed
failed
expired
deleted
```

Responsive behavior:

```text
mobile: full width
tablet: 2-column grid
desktop: 2–3-column grid
large desktop: 3–4-column grid
```

---

## 6.2 ProjectList

Purpose:

Render project cards or project rows.

Variants:

```text
grid
list
```

MVP recommendation:

```text
grid
```

States:

```text
loading
empty
success
error
```

---

## 6.3 DashboardCreditSummary

Purpose:

Compact overview of current balance.

Displays:

```text
credit balance
estimated video minutes available
buy credits action
```

---

## 7. Project Creation Components

## 7.1 NewProjectForm

Purpose:

Create a project.

Fields:

```text
project name
output type
desired clip count, optional
captions enabled by default, optional
```

States:

```text
idle
submitting
success
error
```

Rules:

- Keep simple.
- Do not include advanced render settings.

---

## 7.2 OutputTypeSelector

Purpose:

Choose:

```text
Short Clips
Summary Video
```

Recommended UI:

```text
two large selectable cards
```

Do not use a tiny dropdown for this choice.

---

## 8. Upload Components

## 8.1 UploadDropzone

Location:

```text
features/upload/components/upload-dropzone.tsx
```

Purpose:

Select or drag local video files.

States:

```text
idle
hover
drag_active
uploading
uploaded
error
disabled
```

Displays:

```text
file rules
file name
file size
progress
error
```

Rules:

- Max file size: 500 MB.
- English-only MVP notice.
- 30-minute MVP duration limit.
- Provide file picker fallback.

Responsive behavior:

```text
mobile: full width, shorter height
tablet: full width
desktop: centered wide panel
```

---

## 8.2 UploadProgressCard

Purpose:

Show upload progress.

Displays:

```text
file name
percentage
bytes uploaded
cancel action, optional
```

States:

```text
uploading
completed
failed
```

---

## 8.3 VideoMetadataCard

Purpose:

Show probed video metadata after upload.

Displays:

```text
file name
duration
file size
resolution
required credits
```

Optional:

```text
codec
fps
```

Do not overwhelm users with technical metadata.

---

## 9. Billing Components

## 9.1 CreditBalanceCard

Location:

```text
features/billing/components/credit-balance-card.tsx
```

Purpose:

Show current credit balance prominently.

Displays:

```text
current credits
estimated minutes available
buy credits CTA
```

Variants:

```text
compact
full
```

---

## 9.2 CreditPackCard

Purpose:

Display a credit package.

Displays:

```text
pack name
price
credits
video minutes
recommended badge, optional
buy CTA
```

Variants:

```text
default
recommended
selected
```

Responsive behavior:

```text
mobile: stacked
tablet: 2-column
desktop: 3-column
```

---

## 9.3 CreditLedgerTable

Purpose:

Display immutable credit history.

Columns:

```text
date
type
amount
description
```

Transaction types:

```text
purchase
processing_deduction
refund
manual_adjustment
expiration_adjustment
```

Responsive behavior:

```text
mobile: card list
tablet+: table
```

---

## 9.4 CreditCostSummary

Purpose:

Show cost before processing.

Displays:

```text
video duration
required credits
current balance
remaining balance
refund policy summary
```

Use on payment/start-processing screen.

---

## 10. Processing Components

## 10.1 ProcessingProgress

Location:

```text
features/processing/components/processing-progress.tsx
```

Purpose:

Show overall job progress.

Props:

```ts
type ProcessingProgressProps = {
  status: JobStatus;
  progress?: number;
  currentStep?: string;
};
```

Rules:

- Use exact percentage only if trustworthy.
- Otherwise use step-based progress.

---

## 10.2 ProcessingStepList

Purpose:

Show workflow steps.

Steps may include:

```text
Queued
Preparing video
Extracting audio
Transcribing
Analyzing
Generating previews
Preview ready
```

Step states:

```text
pending
active
completed
failed
```

---

## 10.3 BackgroundProcessingNotice

Purpose:

Reassure user that processing continues after leaving the page.

Example copy:

```text
You can leave this page. RepurposePro will keep processing your video in the background.
```

---

## 10.4 RefundNotice

Purpose:

Show clear credit refund confirmation after failure.

Displays:

```text
failure stage
credits refunded
new balance, optional
retry action
```

Variants:

```text
info
success
warning
```

---

## 11. Clip Editor Components

## 11.1 ClipPreviewEditor

Location:

```text
features/clips/components/clip-preview-editor.tsx
```

Purpose:

Main editor shell.

Desktop layout:

```text
Left: Clip list
Center: Vertical preview
Right: Clip settings
```

Owns:

```text
selected clip state
editor layout state
unsaved metadata state
save state
```

Does not own:

```text
billing logic
render worker logic
Stripe logic
```

Responsive behavior:

```text
mobile: not full editor; show larger-screen recommendation
tablet: simplified tabs/panels
desktop: full 3-panel layout
large desktop: wider preview and settings
```

---

## 11.2 ClipList

Purpose:

Render candidate clips.

States:

```text
loading
empty
success
error
```

Supports:

```text
selection
deleted state
regeneration state
rendered state
```

---

## 11.3 ClipListItem

Purpose:

Show one clip candidate.

Displays:

```text
title
duration
AI score, optional
reason selected
selected state
regenerate action
```

States:

```text
default
hover
selected
deleted
regenerating
rendered
```

---

## 11.4 ClipPreviewPlayer

Purpose:

Preview a candidate clip from the source video.

Props:

```ts
type ClipPreviewPlayerProps = {
  sourceUrl: string;
  startTime: number;
  endTime: number;
  crop?: CropMetadata;
  captionsEnabled: boolean;
  captions: CaptionLine[];
  captionPosition: CaptionPosition;
  captionFontSize: number;
};
```

Behavior:

- Seek to start time.
- Stop or loop at end time.
- Preview 9:16 crop.
- Render captions as HTML/CSS overlay.
- Do not render final MP4.

---

## 11.5 VerticalCropPreview

Purpose:

Simulate vertical crop in browser.

Displays:

```text
9:16 viewport
face-aware crop metadata
center-crop fallback
safe zones
```

Rules:

- Preview only.
- Final crop applied by FFmpeg.

---

## 11.6 CaptionOverlay

Purpose:

Render live caption preview over video.

Props:

```ts
type CaptionOverlayProps = {
  lines: CaptionLine[];
  currentTime: number;
  position: CaptionPosition;
  fontSize: number;
  highlights: string[];
  enabled: boolean;
};
```

States:

```text
hidden
visible
editing
```

Rules:

- Use brand caption tokens.
- Keep safe-zone support.
- Highlight 1–3 meaningful words per line.

---

## 11.7 CaptionEditor

Purpose:

Edit caption metadata.

Controls:

```text
captions on/off
caption text
font size
position
highlighted words
```

Subcomponents:

```text
CaptionTextEditor
CaptionPositionControl
CaptionFontSizeControl
KeywordHighlightEditor
```

---

## 11.8 CaptionTextEditor

Purpose:

Edit caption lines.

Rules:

- Update preview instantly.
- Save metadata explicitly or with debounce.
- Warn before leaving with unsaved changes.

---

## 11.9 CaptionPositionControl

Purpose:

Change caption position.

MVP variants:

```text
middle
lower_middle
bottom_safe
custom, optional
```

Recommended MVP:

```text
preset positions first
```

Drag positioning may be added later.

---

## 11.10 CaptionFontSizeControl

Purpose:

Adjust caption size.

Recommended variants:

```text
small
medium
large
extra_large
```

Avoid exposing raw pixel values unless needed.

---

## 11.11 KeywordHighlightEditor

Purpose:

Manage highlighted caption words.

Behavior:

- Show selected words as chips.
- Allow remove.
- Allow add manually.
- Keep one highlight color in MVP.

---

## 11.12 TrimControls

Purpose:

Adjust clip start and end.

Displays:

```text
start time
end time
duration
optional mini-range track
```

Rules:

- End must be after start.
- Must remain within source duration.
- Show guidance for recommended social duration.
- Update preview immediately.

---

## 11.13 RegenerateClipButton

Purpose:

Replace one bad clip with another candidate.

States:

```text
idle
loading
success
error
disabled
```

Rules:

- Prefer backup candidates before new AI call.
- Do not charge extra in MVP.
- Affect only one clip.

---

## 11.14 AIReasonCard

Purpose:

Explain why RepurposePro selected a clip.

Displays:

```text
short reason
optional score
selection criteria tags
```

Example:

```text
Strong hook, useful insight, and clear emotional delivery.
```

---

## 12. Summary Editor Components

## 12.1 SummaryPreviewEditor

Purpose:

Review summary video segments before render.

Layout:

```text
segment list
source video preview
duration summary
render action
```

Rules:

- Preserve chronological order in MVP.
- No complex freeform timeline.

---

## 12.2 SummarySegmentList

Purpose:

Render chronological summary segments.

States:

```text
loading
empty
success
error
```

---

## 12.3 SummarySegmentCard

Purpose:

Show one selected summary segment.

Displays:

```text
start time
end time
duration
reason selected
preview action
remove action
```

States:

```text
default
selected
removed
editing
```

---

## 12.4 SummaryDurationBar

Purpose:

Show current summary length versus target.

Displays:

```text
current duration
target duration
original duration
```

Example:

```text
Summary: 3:04 / Target: 3:00
```

---

## 13. Render Components

## 13.1 RenderActionBar

Purpose:

Primary render controls.

Displays:

```text
selected output count
render CTA
estimated action summary
```

Example:

```text
8 clips selected
Render Selected Clips
```

---

## 13.2 RenderProgress

Purpose:

Show final MP4 rendering progress.

Displays:

```text
overall progress
current clip
completed count
queued count
failed count
```

States:

```text
preparing
rendering
saving
completed
failed
```

---

## 13.3 RenderClipStatusList

Purpose:

Show per-clip render state.

Item states:

```text
queued
rendering
completed
failed
```

---

## 14. Output Components

## 14.1 OutputCard

Location:

```text
features/outputs/components/output-card.tsx
```

Purpose:

Show final downloadable output.

Displays:

```text
video preview
title
duration
file size
created date
expiration
download action
delete action
```

Variants:

```text
clip
summary
```

States:

```text
ready
downloading
expired
deleted
failed
```

Responsive behavior:

```text
mobile: single column
tablet: 2-column
desktop: 3-column
```

---

## 14.2 OutputVideoPreview

Purpose:

Preview final MP4.

Rules:

- Use native video controls.
- Avoid autoplay with sound.
- Lazy-load when possible.

---

## 14.3 DownloadButton

Purpose:

Download final output.

States:

```text
ready
downloading
completed
failed
disabled
expired
```

---

## 14.4 DownloadAllButton

Purpose:

Optional bulk download.

MVP status:

```text
optional
```

If implemented, package outputs as ZIP only when practical.

---

## 15. Settings Components

## 15.1 ProfileForm

Fields:

```text
name
email
password settings, if supported
```

States:

```text
idle
saving
success
error
```

---

## 15.2 DeleteAccountSection

Purpose:

Destructive account action.

Rules:

- Separate visually from normal settings.
- Require confirmation.
- Explain retained billing history if applicable.

---

## 16. Feedback Components

## 16.1 Toast

Use for:

```text
Project created
Clip saved
Caption updated
Render started
Credits added
Output deleted
```

Do not use for critical errors requiring action.

---

## 16.2 InlineError

Use for:

```text
form validation
upload failures
processing failures
render failures
payment failures
```

---

## 16.3 SuccessBanner

Use for:

```text
Preview ready
Credits purchased
Render complete
Refund completed
```

---

## 17. Loading, Empty, Error, and Disabled States

Every major data-driven component should define appropriate states.

Required state matrix:

| Component | Loading | Empty | Error | Disabled | Expired | Deleted |
|---|---|---|---|---|---|---|
| ProjectList | Yes | Yes | Yes | No | No | No |
| UploadDropzone | Yes | Yes | Yes | Yes | No | No |
| ClipList | Yes | Yes | Yes | No | No | Yes |
| SummarySegmentList | Yes | Yes | Yes | No | No | Yes |
| OutputCard | Yes | No | Yes | Yes | Yes | Yes |
| CreditLedgerTable | Yes | Yes | Yes | No | No | No |
| ProcessingProgress | Yes | No | Yes | No | No | No |

Rules:

- Do not leave blank areas while loading.
- Do not use generic “Something went wrong” when a specific message is available.
- Do not show active actions on expired or deleted items.

---

## 18. Responsive Component Rules

## 18.1 Mobile

Target:

```text
< 768px
```

Rules:

- Sidebar becomes drawer/sheet.
- Project cards stack.
- Billing cards stack.
- Upload remains fully usable.
- Preview editor may show larger-screen recommendation.
- Tables become cards where needed.

---

## 18.2 Tablet

Target:

```text
768px–1023px
```

Rules:

- Compact sidebar.
- Two-column project grids.
- Billing cards may use two columns.
- Editor may use tabs between list, preview, and settings.

---

## 18.3 Desktop

Target:

```text
1024px–1535px
```

Rules:

- Persistent sidebar.
- Full editor layout.
- Multi-column dashboard.
- Side-by-side billing cards.

---

## 18.4 Large Desktop

Target:

```text
1536px+
```

Rules:

- Keep max content width controlled.
- Do not stretch editor endlessly.
- Allow more breathing room around preview canvas.

---

## 19. Accessibility Rules by Component

## 19.1 Buttons

- Must have accessible labels.
- Icon-only buttons require `aria-label`.
- Loading buttons should announce progress where appropriate.

---

## 19.2 Dialogs

- Must trap focus.
- Must restore focus on close.
- Escape closes unless destructive flow requires otherwise.
- Destructive action should not receive automatic initial focus.

---

## 19.3 Video Components

- Play/pause must be keyboard accessible.
- Caption toggle must have a visible label.
- Current time and duration should be available.
- Do not rely on hover-only controls.

---

## 19.4 Status Components

Do not communicate status with color alone.

Use:

```text
color + icon + text label
```

---

## 20. Component Composition Rules

Good composition:

```text
ProjectCard
  -> Card
  -> StatusBadge
  -> ExpirationBadge
  -> Button
```

Good composition:

```text
ClipPreviewEditor
  -> ClipList
  -> ClipPreviewPlayer
  -> CaptionEditor
  -> TrimControls
```

Avoid giant components that own:

```text
UI
API requests
billing logic
queue logic
rendering logic
```

Keep concerns separated.

---

## 21. Suggested Component Tree

```text
apps/web/
  components/
    ui/
      button.tsx
      input.tsx
      textarea.tsx
      select.tsx
      dialog.tsx
      tooltip.tsx
      tabs.tsx
      badge.tsx
      card.tsx
      progress.tsx
      skeleton.tsx
      table.tsx
      sheet.tsx
      popover.tsx

    app/
      app-sidebar.tsx
      app-topbar.tsx
      page-header.tsx
      empty-state.tsx
      error-state.tsx
      loading-state.tsx
      confirmation-dialog.tsx
      status-badge.tsx
      expiration-badge.tsx

  features/
    projects/
      components/
        project-card.tsx
        project-list.tsx
        dashboard-credit-summary.tsx
        new-project-form.tsx
        output-type-selector.tsx

    upload/
      components/
        upload-dropzone.tsx
        upload-progress-card.tsx
        video-metadata-card.tsx

    billing/
      components/
        credit-balance-card.tsx
        credit-pack-card.tsx
        credit-ledger-table.tsx
        credit-cost-summary.tsx

    processing/
      components/
        processing-progress.tsx
        processing-step-list.tsx
        background-processing-notice.tsx
        refund-notice.tsx

    clips/
      components/
        clip-preview-editor.tsx
        clip-list.tsx
        clip-list-item.tsx
        clip-preview-player.tsx
        vertical-crop-preview.tsx
        caption-overlay.tsx
        caption-editor.tsx
        caption-text-editor.tsx
        caption-position-control.tsx
        caption-font-size-control.tsx
        keyword-highlight-editor.tsx
        trim-controls.tsx
        regenerate-clip-button.tsx
        ai-reason-card.tsx

    summary/
      components/
        summary-preview-editor.tsx
        summary-segment-list.tsx
        summary-segment-card.tsx
        summary-duration-bar.tsx

    rendering/
      components/
        render-action-bar.tsx
        render-progress.tsx
        render-clip-status-list.tsx

    outputs/
      components/
        output-card.tsx
        output-video-preview.tsx
        download-button.tsx
        download-all-button.tsx

    settings/
      components/
        profile-form.tsx
        delete-account-section.tsx
```

---

## 22. MVP Component Priority

Build components in this order:

1. Button
2. Input
3. Card
4. Badge
5. Dialog
6. Progress
7. AppSidebar
8. AppTopbar
9. PageHeader
10. StatusBadge
11. ProjectCard
12. UploadDropzone
13. VideoMetadataCard
14. CreditBalanceCard
15. CreditPackCard
16. CreditCostSummary
17. ProcessingProgress
18. ProcessingStepList
19. ClipList
20. ClipListItem
21. ClipPreviewPlayer
22. CaptionOverlay
23. CaptionEditor
24. TrimControls
25. RegenerateClipButton
26. RenderProgress
27. OutputCard
28. CreditLedgerTable
29. SummarySegmentCard
30. SummaryDurationBar

---

## 23. MVP Components to Defer

Do not build these in the first version unless required:

```text
TemplatePresetPicker
BrandKitEditor
MultiTrackTimeline
AudioMixer
BrollLibrary
TransitionPicker
MusicPicker
SocialPublishDialog
TeamMemberManager
AdvancedCropTimeline
KeyboardShortcutPalette
```

---

## 24. Registry Maintenance Rules

Update this file when:

- A reusable component is added.
- A component gains a new variant.
- A component changes ownership.
- A component becomes deprecated.
- Responsive behavior changes.
- Accessibility behavior changes.
- A component moves from feature-specific to shared.

Do not add every tiny wrapper to the registry.

Register meaningful reusable components only.

---

## 25. Final Rule

RepurposePro's component system should support the fastest path from long video to usable content.

The registry should help enforce:

```text
clear components
clear ownership
clear states
clear responsive behavior
clear product intent
```

The UI system should remain premium, consistent, and focused without becoming a full professional video editor.
