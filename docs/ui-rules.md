# RepurposePro UI Rules

## 1. Purpose

This document defines practical UI rules for **RepurposePro**.

RepurposePro is a premium AI video repurposing app for podcasters and YouTubers. The UI should help users move through a clear workflow:

```text
Upload video -> Pay with credits -> Process -> Preview clips or summary -> Edit metadata -> Render -> Download
```

The interface should feel:

- Premium
- Fast
- Clear
- Trustworthy
- Creator-focused
- Minimal but powerful
- Production-ready

The UI should avoid feeling like a complicated professional video editor.

Core product rule:

```text
Preview with metadata first. Render final MP4s later.
```

---

## 2. Core UI Principles

## 2.1 Clarity Over Complexity

Users should always understand:

- What step they are on
- What the app is doing
- What they need to do next
- Whether credits will be charged
- Whether files will expire
- Whether edits affect preview metadata or final rendered MP4s

Avoid hidden behavior.

---

## 2.2 One Primary Action Per Screen

Each screen should have one obvious primary action.

Examples:

| Screen | Primary Action |
|---|---|
| Dashboard | New Project |
| Upload | Continue |
| Payment | Start Processing or Buy Credits |
| Processing | View Preview when ready |
| Clip Preview | Render Selected Clips |
| Summary Preview | Render Summary |
| Outputs | Download |

Secondary actions should be visually quieter.

---

## 2.3 Make Expensive Actions Explicit

Expensive or irreversible actions must be clear.

Examples:

- Starting processing
- Deducting credits
- Rendering final MP4s
- Deleting a project
- Deleting outputs
- Regenerating a clip
- Removing a clip from selection

Do not trigger costly work from tiny accidental UI interactions.

---

## 2.4 Metadata Edits Should Feel Instant

In the preview editor, edits should update the browser preview immediately.

These edits are metadata only:

- Trim start time
- Trim end time
- Caption text
- Caption position
- Caption font size
- Caption on/off
- Highlighted keywords
- Selected/deleted state

Final MP4 changes happen only after the user clicks **Render** or **Export**.

---

## 2.5 Keep the MVP Editor Simple

The MVP editor is not a full video editor.

Do not build:

- Multi-track timeline
- Drag-and-drop video layers
- B-roll editor
- Audio mixer
- Keyframe animation
- Template marketplace
- Advanced crop timeline
- Direct publishing workflow

Build:

- Preview
- Trim
- Caption controls
- Delete
- Regenerate
- Render
- Download

---

## 3. App Navigation Rules

## 3.1 Main Navigation

The main app navigation should include:

```text
Dashboard
New Project
Billing
Settings
```

Use a sidebar on desktop.

Use a top nav or drawer on smaller screens.

---

## 3.2 Project-Level Navigation

Inside a project, show the project workflow.

Recommended project steps:

```text
Upload
Payment
Processing
Preview
Render
Outputs
```

Only show steps that apply to the current project state.

---

## 3.3 Navigation State

Users should never land on a dead screen.

If a user visits a route too early, redirect or show a clear state.

Examples:

| User tries to access | If not ready |
|---|---|
| Preview screen | Show processing status |
| Outputs screen | Show render status |
| Render screen | Show preview first |
| Payment screen after payment | Redirect to processing |

---

## 4. Page Rules

## 4.1 Landing Page

The landing page should explain RepurposePro quickly.

Above the fold:

- Clear headline
- Short subheading
- Product visual
- Primary CTA
- Secondary CTA, optional

Recommended copy direction:

```text
Turn long videos into high-performing clips.
```

Do not overload the landing page with technical details.

Focus on creator outcomes.

---

## 4.2 Auth Screens

Signup and login screens should be simple and premium.

Rules:

- Keep fields minimal.
- Use clear error messages.
- Never expose auth internals.
- Keep users oriented after signup.

After signup, send users to the dashboard or new project flow.

---

## 4.3 Dashboard

The dashboard should answer:

- How many credits do I have?
- What projects do I have?
- What is each project’s status?
- What should I do next?

Dashboard sections:

- Credit balance
- New Project CTA
- Recent projects
- Empty state
- Optional quick stats

Project cards should show:

- Project name
- Output type
- Status
- Created date
- Expiration date
- Clip/output count if available
- Continue action

---

## 4.4 New Project Screen

Keep project creation lightweight.

Required:

- Project name
- Output type:
  - Short clips
  - Summary video

Optional MVP settings:

- Desired number of clips
- Captions enabled by default

Do not show advanced render settings here.

---

## 4.5 Upload Screen

The upload screen should be reassuring and explicit.

Show:

- Drag-and-drop area
- File limits
- Supported formats
- English-only MVP notice
- Upload progress
- Validation result
- Video duration after probing
- Required credits estimate

Rules:

- Validate file size before upload when possible.
- Probe duration after upload.
- Reject videos over MVP duration limit.
- Show specific error messages.

Example errors:

```text
This file is larger than 500 MB.
```

```text
This video is 42 minutes long. The MVP limit is 30 minutes.
```

```text
We could not find an audio track in this video.
```

---

## 4.6 Payment / Credits Screen

The payment screen should make cost clear before processing.

Show:

- Current credits
- Required credits
- Remaining balance after processing
- Credit pack options
- Whether credits will be refunded on failure

Rules:

- Do not start processing until credits are available.
- Do not hide the deduction.
- Use clear CTA labels.

Good CTA labels:

```text
Start Processing
Buy Credits
Continue to Stripe
```

Avoid vague labels:

```text
Continue
Submit
Go
```

---

## 4.7 Processing Screen

The processing screen should reduce anxiety.

Show:

- Current step
- Progress bar
- Step list
- Project information
- Uploaded video metadata
- What happens next

Processing states:

```text
Queued
Transcribing
Analyzing
Preview ready
Rendering
Completed
Failed
Refunded
Deleted
```

Rules:

- Make progress feel alive, but do not fake precise accuracy.
- Use step-based progress if exact progress is unavailable.
- Let users leave the screen safely.
- Explain that processing continues after upload.

Good copy:

```text
You can leave this page. We’ll keep processing your video in the background.
```

---

## 4.8 Clip Preview Editor

The clip preview editor is the main product experience.

Recommended layout on desktop:

```text
Left: Clip list
Center: Vertical preview
Right: Clip settings
```

### Clip List Rules

Each clip list item should show:

- Clip title
- Duration
- AI score, optional
- Reason selected, short
- Selected/deleted state
- Regenerate action

Selected clip should be visually obvious.

Deleted clips should either disappear or move into a muted deleted state.

### Preview Rules

The preview should show:

- Source video segment
- Vertical crop preview
- Caption overlay
- Start/end boundaries
- Play/pause controls
- Current timestamp

The preview should not be a rendered MP4 unless final render is complete.

### Settings Rules

Clip settings should include:

- Start time
- End time
- Caption toggle
- Caption text
- Caption font size
- Caption position
- Highlighted keywords
- Delete clip
- Regenerate clip

Keep advanced controls hidden or deferred.

---

## 4.9 Summary Preview Editor

The summary preview editor should be simpler than the clip editor.

Show:

- Ordered summary segments
- Segment start/end times
- Segment reason
- Total summary duration
- Target duration
- Source video preview

Rules:

- Preserve chronological order in MVP.
- Allow segment deletion.
- Allow start/end adjustment.
- Avoid complex reordering for MVP unless necessary.

Primary action:

```text
Render Summary
```

---

## 4.10 Render Screen

The render screen should show final MP4 creation progress.

Show:

- Render progress
- Current render step
- List of selected clips being rendered
- Completed clip count
- Failure state if rendering fails

Rules:

- Rendering starts only after explicit user action.
- Render selected clips only.
- Use latest saved metadata.
- Do not silently re-render everything.

---

## 4.11 Outputs Screen

The outputs screen should make downloads obvious.

For clips, show output cards with:

- Video preview
- Title
- Duration
- File size
- Created date
- Expiration date
- Download button
- Delete button

For summary, show:

- Summary video preview
- Duration
- Download MP4 button
- Expiration notice

Rules:

- Always show that files expire after 7 days.
- Show expired/deleted states clearly.
- Do not show broken download buttons.

---

## 4.12 Billing Screen

Billing should be simple.

Show:

- Current credit balance
- Credit pack cards
- Transaction history
- Refunds

Credit ledger rows should show:

- Date
- Type
- Amount
- Description

Use positive and negative signs clearly:

```text
+40 credits
-12 credits
+12 credits refunded
```

---

## 4.13 Settings Screen

MVP settings should stay minimal.

Include:

- Name
- Email
- Password settings if supported
- Logout
- Delete account, optional

Defer:

- Brand kits
- Team settings
- Template defaults
- Publishing integrations
- Advanced caption styles

---

## 5. Layout Rules

## 5.1 Desktop First for Editor

The editor can be desktop-first for MVP.

Minimum recommended editor width:

```text
1024px
```

On smaller screens, show a message or simplified layout.

Example:

```text
The clip editor works best on a larger screen.
```

---

## 5.2 Use Consistent Page Shells

Use one consistent app shell for authenticated pages:

- Sidebar
- Topbar
- Content area
- User menu
- Credit balance shortcut

Do not redesign navigation per screen.

---

## 5.3 Keep Content Width Controlled

Dashboard pages should not stretch too wide.

Recommended max width:

```text
1440px
```

Marketing pages can use full-width hero sections, but content should still align to a grid.

---

## 5.4 Use Cards for Grouped Information

Use cards for:

- Projects
- Credit packs
- Upload status
- Processing status
- Clip candidates
- Output files
- Billing transactions

Avoid cards inside cards unless necessary.

---

## 6. Component Rules

## 6.1 Buttons

Every button should clearly describe the action.

Good:

```text
New Project
Upload Video
Start Processing
Render Selected Clips
Download MP4
Buy Credits
Regenerate Clip
```

Bad:

```text
Submit
Go
OK
Proceed
```

Use destructive styling for:

- Delete project
- Delete clip
- Delete output
- Delete account

---

## 6.2 Primary Buttons

Only one primary button should appear in the main action area.

Examples:

- Upload screen: **Continue**
- Payment screen: **Start Processing**
- Preview screen: **Render Selected Clips**
- Outputs screen: **Download All**, if implemented

Secondary actions should use outline or ghost buttons.

---

## 6.3 Disabled Buttons

Disabled buttons must explain why when not obvious.

Examples:

```text
Not enough credits
```

```text
Upload a video first
```

```text
Select at least one clip
```

Use helper text or tooltip.

---

## 6.4 Forms

Forms should:

- Validate inline
- Show helpful errors
- Preserve user input after error
- Avoid unnecessary fields
- Use specific labels

Do not rely only on placeholder text.

---

## 6.5 Dialogs

Use dialogs for:

- Confirm delete
- Confirm credit deduction
- Confirm render if many clips
- Explain failed job refund
- Stripe checkout redirect confirmation if needed

Do not use dialogs for normal navigation.

---

## 6.6 Toasts

Use toasts for short confirmations:

- Project created
- Clip saved
- Caption updated
- Render started
- Credits added
- Output deleted

Do not use toasts for critical failures that require user action. Use inline error states instead.

---

## 7. Clip Preview Editor Rules

## 7.1 Start and End Trimming

Users should be able to adjust:

- Start time
- End time

Rules:

- End time must be after start time.
- Clip should not exceed source video duration.
- Warn if clip is too short.
- Warn if clip is too long.
- Show calculated duration.

Recommended duration guidance:

```text
Best for Shorts/Reels: 45–120 seconds
```

---

## 7.2 Caption Editing

Users should be able to edit caption text before render.

Rules:

- Caption edits update preview immediately.
- Caption text must be saved before render.
- If unsaved changes exist, warn before leaving.
- Use clear active caption state.

---

## 7.3 Caption Position

Caption position should be adjustable visually.

MVP options:

- Preset positions:
  - Middle
  - Lower middle
  - Bottom safe
- Drag-to-position, optional

If drag positioning is implemented:

- Keep captions inside safe zones by default.
- Allow advanced override later.
- Show safe zone guides while dragging.

---

## 7.4 Caption Font Size

Allow simple font size adjustment.

Recommended UI:

- Small
- Medium
- Large
- Extra Large

Avoid raw pixel controls for MVP unless needed.

---

## 7.5 Highlighted Keywords

AI-selected highlighted keywords should be editable.

MVP options:

- Show highlighted words as chips.
- Allow removing a highlighted word.
- Allow adding a word manually.

Rules:

- Do not highlight too many words.
- Keep highlight color consistent.
- Avoid more than one highlight color in MVP.

---

## 7.6 Delete Clip

Deleting a clip should not delete the source video.

It should remove the clip from the selected set or mark it as deleted.

Recommended behavior:

- First click: remove from selected clips
- Optional undo toast
- Keep backup candidates available

---

## 7.7 Regenerate Clip

Regeneration should replace one bad clip with another candidate from the same video.

Rules:

- Do not charge extra for MVP regeneration inside the same paid job.
- Prefer backup candidates before making another AI call.
- Show loading state only for the affected clip.
- Do not regenerate all clips unless explicitly requested.

CTA label:

```text
Regenerate Clip
```

---

## 8. Summary Editor Rules

## 8.1 Chronological Order

For MVP, summary segments should stay chronological.

Do not allow free reordering unless the product later supports topic-based summaries.

---

## 8.2 Segment Controls

Each summary segment should allow:

- Preview
- Start time edit
- End time edit
- Remove segment

Optional:

- Restore removed segment

---

## 8.3 Summary Duration

Always show:

- Current total summary duration
- Target summary duration
- Original video duration

Example:

```text
Summary: 3:04 / Target: 3:00
```

---

## 9. Credit and Billing UI Rules

## 9.1 Always Show Credit Impact

Before processing, show:

```text
This job will use 18 credits.
```

Also show:

```text
Your balance after processing: 22 credits.
```

---

## 9.2 Refund Messaging

If processing fails and credits are refunded, show a clear message.

Example:

```text
Processing failed during transcription. Your 18 credits have been refunded.
```

Do not make users guess whether they were charged.

---

## 9.3 Credit Pack Cards

Credit pack cards should show:

- Pack name
- Price
- Included minutes/credits
- Effective price per minute, optional
- Recommended badge for best value

Do not hide the credit conversion.

---

## 10. State Rules

## 10.1 Empty States

Every major list needs an empty state.

Examples:

Dashboard:

```text
No projects yet. Upload your first video to generate clips.
```

Outputs:

```text
No rendered outputs yet. Render your selected clips to download MP4s.
```

Billing:

```text
No transactions yet. Buy credits to start processing videos.
```

---

## 10.2 Loading States

Use skeletons for:

- Dashboard project list
- Clip list
- Billing history
- Output cards

Use progress indicators for:

- Uploading
- Processing
- Rendering

---

## 10.3 Error States

Errors should be human-readable and specific.

Good:

```text
We could not process this video because it does not contain an audio track.
```

Bad:

```text
FFmpeg error code 1.
```

Internal technical details should be logged, not shown.

---

## 10.4 Success States

Success states should guide the next action.

Examples:

```text
Your clip previews are ready. Review them before rendering.
```

```text
Your clips are ready to download.
```

```text
Credits added successfully. You can now start processing.
```

---

## 11. Status Label Rules

Use consistent labels across the app.

| Internal Status | User Label |
|---|---|
| `uploaded` | Uploaded |
| `waiting_for_payment` | Waiting for payment |
| `queued` | Queued |
| `transcribing` | Transcribing |
| `analyzing` | Analyzing |
| `preview_ready` | Preview ready |
| `waiting_for_user_edits` | Waiting for edits |
| `rendering` | Rendering |
| `completed` | Completed |
| `failed` | Failed |
| `refunded` | Refunded |
| `deleted` | Deleted |

Do not expose internal queue names to users.

---

## 12. Copywriting Rules

## 12.1 Voice

RepurposePro should sound:

- Clear
- Confident
- Helpful
- Creator-aware
- Non-technical

Avoid sounding:

- Overly cute
- Corporate
- Robotic
- Too technical
- Overhyped

---

## 12.2 Preferred Terms

Use these terms consistently:

| Use | Avoid |
|---|---|
| Credits | Tokens |
| Clips | Snippets |
| Summary video | Recap render |
| Preview | Draft render |
| Render | Process again |
| Download | Export file |
| Project | Job |
| Processing | Pipeline |

---

## 12.3 Explain AI Simply

Good:

```text
RepurposePro found moments with strong hooks, useful insights, and emotional delivery.
```

Avoid:

```text
The model optimized transcript embeddings using a relevance scoring pipeline.
```

---

## 13. Accessibility Rules

## 13.1 Keyboard Navigation

Users should be able to use the app with a keyboard.

Required:

- Visible focus states
- Logical tab order
- Keyboard-accessible buttons
- Keyboard-accessible dialogs
- Escape closes modals
- Enter confirms primary dialog actions where appropriate

---

## 13.2 Color Contrast

Ensure readable contrast for:

- Body text
- Buttons
- Badges
- Form labels
- Error messages
- Captions over video

Do not rely on color alone to communicate status.

Use labels and icons too.

---

## 13.3 Video Controls

Video preview controls must be accessible.

Include:

- Play/pause button label
- Current time
- Duration
- Keyboard controls where feasible
- Captions toggle label

---

## 13.4 Reduced Motion

Respect reduced motion preferences.

If enabled:

- Disable ambient animated glows
- Disable looping signal animations
- Keep progress changes functional
- Keep transitions minimal

---

## 14. Responsive Rules

## 14.1 Dashboard

Dashboard should work well on desktop, tablet, and mobile.

Project cards can stack on smaller screens.

---

## 14.2 Billing

Billing should be fully responsive.

Credit pack cards should stack on mobile.

---

## 14.3 Upload

Upload should be fully responsive.

Drag-and-drop should have a clear file picker fallback.

---

## 14.4 Preview Editor

The preview editor can be desktop-first.

For smaller screens:

- Collapse sidebars into tabs, or
- Show a message recommending desktop

MVP acceptable message:

```text
For the best editing experience, open this project on a larger screen.
```

---

## 15. Security and Trust UI Rules

## 15.1 File Expiration

Always show that files expire after 7 days.

Examples:

```text
Files expire in 7 days.
```

```text
This output expires tomorrow.
```

```text
Expired files are automatically deleted.
```

---

## 15.2 Payment Trust

Billing screens should make Stripe involvement clear.

Example:

```text
Secure checkout powered by Stripe.
```

Do not ask users to enter card details directly in your own UI.

---

## 15.3 Privacy Messaging

For uploads, reassure users.

Example:

```text
Your uploaded video is used only to generate your clips and is automatically deleted after 7 days.
```

---

## 16. Confirmation Rules

Require confirmation for:

- Delete project
- Delete source video
- Delete rendered output
- Delete account
- Start processing if credits will be deducted
- Render large batch if many clips are selected

Do not require confirmation for:

- Saving caption text
- Moving caption position
- Changing font size
- Selecting/deselecting clips
- Preview playback

---

## 17. Destructive Action Rules

Destructive actions must:

- Use destructive styling
- Explain what will be deleted
- Explain whether the action can be undone
- Never be the default focused action in a dialog

Example delete copy:

```text
Delete this project? This will remove the uploaded video, previews, and rendered outputs. Your billing history will be kept.
```

---

## 18. AI Result Trust Rules

AI-generated clips should include short explanations.

Show:

- Clip title
- AI reason
- Duration
- Transcript excerpt, optional

Example reason:

```text
Strong hook, useful insight, and clear emotional delivery.
```

This helps users understand why RepurposePro chose each clip.

---

## 19. Performance UI Rules

## 19.1 Avoid Blocking Screens

Do not freeze the UI while:

- Uploading
- Processing
- Rendering
- Saving metadata
- Regenerating a clip

Use loading states and keep navigation available where safe.

---

## 19.2 Polling Job Status

For MVP, polling is acceptable.

Recommended behavior:

- Poll every 2–5 seconds during active processing.
- Slow down polling when the tab is hidden.
- Stop polling when job completes or fails.

Later, consider WebSockets or server-sent events.

---

## 19.3 Optimistic Updates

Optimistic updates are acceptable for low-risk metadata edits.

Examples:

- Caption position
- Caption font size
- Caption text
- Clip selected state

Do not use optimistic updates for:

- Credit deduction
- Stripe payment success
- Job completion
- Refunds
- File deletion unless rollback is handled

---

## 20. MVP Screen Checklist

The MVP should include these screens:

1. Landing page
2. Signup
3. Login
4. Dashboard
5. New project
6. Upload video
7. Payment / credits
8. Processing status
9. Clip preview editor
10. Summary preview editor
11. Render status
12. Outputs/download
13. Billing
14. Settings
15. Error/refund states

---

## 21. Do and Do Not

## 21.1 Do

- Make the next action obvious.
- Use one primary CTA per screen.
- Show credit cost before processing.
- Show processing progress clearly.
- Let users preview before rendering.
- Keep editor controls focused.
- Use clear AI explanations.
- Show expiration dates.
- Use consistent status labels.
- Use metadata-first editing.

---

## 21.2 Do Not

- Do not make the MVP feel like Adobe Premiere.
- Do not hide credit deductions.
- Do not render on every small edit.
- Do not auto-render all clips without user confirmation.
- Do not expose internal worker or queue errors.
- Do not use vague button labels.
- Do not overuse modals.
- Do not add multiple templates in MVP.
- Do not let users accidentally start expensive jobs.
- Do not bury failed-job refunds.

---

## 22. Final UI Rule

Every RepurposePro screen should help the user answer one question:

```text
What is the fastest path from this long video to usable short-form content?
```

If a UI element does not support that path, remove it or defer it.
