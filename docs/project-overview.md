# RepurposePro Project Overview

## 1. Product Summary

**RepurposePro** is a web app that helps podcasters and YouTubers turn long podcast or talking-head videos into short vertical social clips and condensed summary videos.

RepurposePro is designed to help creators:

- Find viral moments
- Save editing time
- Generate TikToks, Instagram Reels, and YouTube Shorts
- Create a summarized video version of a full-length video

The MVP focuses on uploaded local videos, automatic AI-assisted clip selection, preview-based editing, and final MP4 rendering.

---

## 2. Target Users

Primary users:

- Podcasters
- YouTubers
- Talking-head content creators

Primary use cases:

- Repurpose long videos into short-form content
- Quickly identify strong moments from long recordings
- Generate social-ready vertical clips
- Create a shorter edited version of a full podcast or video

---

## 3. MVP Scope

### Included in MVP

The RepurposePro MVP should include:

- User accounts
- Local video uploads
- Maximum upload size of 500 MB
- English-only video support
- MVP processing limit of 30 minutes per video
- Pay-per-video-minute credit system
- Stripe payment flow
- Background processing after upload
- Self-hosted Whisper transcription
- AI clip selection using Gemini
- AI summary segment selection using Gemini
- Preview clips before final rendering
- Simple metadata-based editor
- Face-aware vertical crop
- Default Hormozi-style captions
- Optional captions
- FFmpeg final rendering
- MP4 export
- Automatic credit refund on failed jobs
- Automatic file deletion after 7 days

### Deferred Until Later

The following should not be built in the first MVP:

- YouTube URL import
- Full 1–2 hour video support
- Multi-language transcription
- Dynamic active-speaker crop
- Advanced timeline editor
- Multiple template presets
- Brand kits
- Team accounts
- Direct publishing to TikTok, Reels, or Shorts
- AI voiceover
- B-roll generation
- Music and sound effects
- Watermarked free previews

---

## 4. Core User Flow

1. User signs up or logs in to RepurposePro.
2. User uploads a local video file.
3. App validates file size, duration, and format.
4. User chooses what to generate:
   - Short vertical clips
   - Summary video
5. App calculates required credits based on video duration.
6. User pays or uses existing credits.
7. Credits are deducted before processing starts.
8. Backend creates a background processing job.
9. Worker transcribes the video using self-hosted Whisper.
10. Worker sends timestamped transcript to Gemini.
11. Gemini returns clip candidates or summary segments.
12. User reviews preview clips or summary preview.
13. User edits metadata before final rendering.
14. User clicks Render or Export.
15. Worker renders final MP4 files with FFmpeg.
16. User downloads final MP4 exports.
17. Files are automatically deleted after 7 days.

---

## 5. Key Product Decisions

| Area | Decision |
|---|---|
| App name | RepurposePro |
| Target users | Podcasters and YouTubers |
| Input source | Local video upload only |
| Max file size | 500 MB |
| MVP max duration | 30 minutes |
| Future duration | 1–2 hours |
| Language | English only |
| Clip length | Flexible, usually 60–90 seconds |
| Clip quantity | 5–10 clips |
| Clip orientation | Vertical 9:16 |
| AI selection | Automatic |
| Clip criteria | Strong hook, emotional reaction, useful insight |
| Summary type | Condensed chronological version |
| Summary length | About 10% of original video |
| Summary audio | Original speaker audio only |
| Captions | Optional, Hormozi style by default |
| Cropping | Face-aware crop |
| Crop fallback | Center crop |
| Editor | Simple metadata editor |
| Rendering | FFmpeg |
| Transcription | Self-hosted Whisper |
| AI model | Gemini, preferably Flash-Lite and Flash |
| Payments | Stripe |
| Business model | Pay per video minute |
| User pays | Before processing |
| Failed jobs | Automatic credit refund |
| Watermark | No watermark |
| Storage retention | Auto-delete after 7 days |

---

## 6. Recommended Pricing Model

Use a credit-based pay-per-minute model.

### Credit Rules

- 1 credit = 1 video minute
- Credits are deducted before processing starts
- Failed jobs automatically refund credits
- Regeneration within the same paid job does not charge extra for MVP

### Suggested Price

Recommended MVP price:

```text
$0.25 per video minute
```

### Suggested Credit Packs

| Pack | Price | Credits / Video Minutes |
|---|---:|---:|
| Starter | $10 | 40 |
| Creator | $25 | 100 |
| Pro | $50 | 200 |

Use credits instead of charging for every individual job to reduce payment friction and avoid excessive small Stripe transactions.

---

## 7. Tech Stack

### Frontend

- Next.js
- shadcn/ui
- Tailwind CSS v4

### Backend

- NestJS
- PostgreSQL
- Drizzle ORM
- Redis
- BullMQ
- Better Auth
- Arcjet
- Stripe

### Processing

- Local worker machine
- Self-hosted Whisper
- FFmpeg
- Gemini 2.5 Flash-Lite
- Gemini 2.5 Flash

---

## 8. System Architecture

RepurposePro should be split into three main parts:

1. Web frontend
2. API backend
3. Local processing worker

### Frontend Responsibilities

The Next.js frontend handles:

- Authentication UI
- Dashboard
- Project creation
- Video upload UI
- Credit purchase UI
- Job status display
- Preview editor
- Caption metadata editing
- Clip trim controls
- Export button
- Download links

### Backend Responsibilities

The NestJS backend handles:

- Authentication integration
- User and project management
- Upload validation
- Video metadata extraction
- Credit balance and ledger
- Stripe Checkout and webhooks
- Job creation
- BullMQ queue management
- Job status updates
- File retention logic
- API endpoints for preview and export metadata

### Worker Responsibilities

The local worker machine handles:

- Downloading or accessing uploaded video files
- FFmpeg probing
- Whisper transcription
- Gemini transcript analysis
- Face detection and crop metadata generation
- Preview metadata generation
- Final FFmpeg rendering
- Uploading or saving rendered MP4 files
- Reporting job progress and failures

---

## 9. Preview-Before-Render Flow

RepurposePro should not immediately render every AI-generated clip.

Instead, the app should generate preview metadata first.

### Preview Metadata Includes

Each clip candidate should include:

- Clip title
- Start time
- End time
- Transcript text
- Caption text
- Highlighted keywords
- Caption position
- Caption font size
- Crop metadata
- AI score
- Reason selected

### Preview Experience

The frontend should preview clips using:

- The original source video
- HTML video playback
- Start and end timestamps
- CSS caption overlays
- CSS-based crop preview when feasible

This lets users review and edit clips before final MP4 rendering.

### Final Rendering

Final rendering only happens when the user clicks Render or Export.

At render time, FFmpeg applies:

- Start and end trim
- Vertical 9:16 crop
- Face-aware crop data
- Caption burn-in
- Edited caption text
- Caption position
- Caption font size
- Highlighted keywords
- MP4 export settings

This reduces wasted rendering and makes editing feel faster.

---

## 10. Clip Generation Requirements

RepurposePro should generate 5–10 clip candidates from each source video.

Clips should be:

- Vertical 9:16
- Usually 60–90 seconds
- Flexible in length when needed
- Understandable on their own
- Based on strong moments from the transcript

AI should optimize for:

- Strong hook
- Emotional reaction
- Useful insight
- Standalone context
- Clean start
- Clean ending
- Low filler

### Suggested Gemini Output for Clips

Gemini should return structured JSON similar to:

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

---

## 11. Summary Video Requirements

The summary video should be a condensed chronological version of the original video.

The summary should:

- Preserve the original order
- Use original speaker audio only
- Remove filler, dead air, repetition, and weak tangents
- Keep the most important ideas
- Target about 10% of the original video length

### Suggested Gemini Output for Summary

Gemini should return structured JSON similar to:

```json
{
  "summarySegments": [
    {
      "startTime": 120.0,
      "endTime": 185.4,
      "reason": "Introduces the main topic and gives necessary context."
    },
    {
      "startTime": 540.2,
      "endTime": 610.8,
      "reason": "Contains the strongest explanation of the main idea."
    }
  ],
  "targetDurationSeconds": 180
}
```

---

## 12. Transcription

Use self-hosted Whisper on the local worker machine.

The transcription output should include:

- Full transcript
- Segment timestamps
- Word-level timestamps if available
- Confidence scores if available

Word-level timestamps are useful for caption timing, but segment-level timestamps may be acceptable for the first version if word-level output is too slow.

---

## 13. Face-Aware Crop

The MVP should use face-aware vertical cropping.

Expected behavior:

- Detect faces in the source video
- Choose a stable 9:16 crop around visible faces
- Keep the primary face or main visible speaker framed well
- Avoid dynamic active-speaker switching for MVP

Fallback:

- If face detection fails, use center crop

This avoids the complexity of dynamic speaker-aware cropping while still improving vertical clip quality.

---

## 14. Caption System

Hormozi-style captions should be the default output style.

### MVP Caption Features

Users should be able to:

- Toggle captions on or off
- Move caption position
- Edit caption text
- Change caption font size
- Automatically highlight keywords

### Caption Rendering

Captions should be previewed in the browser using CSS overlays.

Captions should be burned into the final MP4 during FFmpeg rendering.

---

## 15. Simple Editor

The MVP editor should be a metadata editor, not a full timeline editor.

Users should be able to:

- Preview each AI-generated clip
- Adjust clip start and end time
- Delete bad clips
- Regenerate one bad clip
- Toggle captions
- Move captions
- Edit caption text
- Change caption font size
- Render/export selected clips

Avoid building:

- Multi-track timelines
- Drag-and-drop video composition
- Advanced keyframes
- Audio mixing
- B-roll editing
- Multi-template editing

---

## 16. Regeneration

When a user regenerates a bad clip:

1. The app selects another unused candidate from the same transcript.
2. The user is not charged again during the same paid job.
3. The replacement appears as preview metadata.
4. Final rendering still happens only after the user clicks Render or Export.

The system should keep backup candidates from Gemini so regeneration does not always require another AI call.

---

## 17. Job States

Recommended job states:

- Uploaded
- Waiting for payment
- Queued
- Transcribing
- Analyzing
- Preview ready
- Waiting for user edits
- Rendering
- Completed
- Failed
- Refunded
- Deleted

---

## 18. Database Tables

Recommended core tables:

- users
- projects
- uploaded_videos
- processing_jobs
- transcripts
- transcript_segments
- clip_candidates
- generated_clips
- summary_segments
- rendered_outputs
- credit_ledger
- stripe_customers
- stripe_payments

### Notes

Never store only a user balance.

Always store an immutable credit ledger so purchases, deductions, refunds, and adjustments can be audited.

---

## 19. Credit Ledger

Recommended transaction types:

- purchase
- processing_deduction
- refund
- manual_adjustment
- expiration_adjustment

Each ledger entry should include:

- User ID
- Project ID if applicable
- Job ID if applicable
- Amount
- Transaction type
- Stripe payment ID if applicable
- Description
- Created timestamp

---

## 20. Failure Handling

If processing fails:

1. Mark the job as failed.
2. Store the failure reason.
3. Automatically refund credits.
4. Create a refund entry in the credit ledger.
5. Show the user a clear failure message.
6. Allow retry if appropriate.

Failure scenarios to handle:

- Upload failure
- Invalid video
- Video too long
- File too large
- Whisper failure
- Gemini failure
- FFmpeg failure
- Worker timeout
- Storage failure
- User has insufficient credits
- Stripe webhook failure

---

## 21. Storage and Retention

The app should store:

- Uploaded source videos
- Transcript files
- Clip candidate metadata
- Caption metadata
- Crop metadata
- Rendered MP4 files
- Summary exports
- Project metadata

Retention policy:

- Users can manually delete files
- Files are automatically deleted after 7 days

Delete after 7 days:

- Uploaded source videos
- Temporary files
- Rendered clips
- Summary videos
- Preview assets if any

Keep:

- User account records
- Payment records
- Credit ledger history
- Basic project/job metadata

---

## 22. Security and Abuse Protection

Use Better Auth for authentication.

Use Arcjet for:

- Rate limiting
- Bot protection
- Signup abuse protection
- Upload abuse protection

Additional protections:

- Validate file type
- Enforce 500 MB file limit
- Enforce 30-minute MVP duration limit
- Limit concurrent jobs per user
- Prevent duplicate Stripe webhook processing
- Protect worker endpoints
- Require signed URLs or authenticated file access
- Avoid exposing raw storage paths publicly

---

## 23. Recommended API Endpoints

Possible backend endpoints:

```text
POST   /projects
GET    /projects
GET    /projects/:projectId
DELETE /projects/:projectId

POST   /projects/:projectId/upload
POST   /projects/:projectId/analyze
GET    /projects/:projectId/jobs/:jobId/status

GET    /projects/:projectId/clips
PATCH  /projects/:projectId/clips/:clipId
DELETE /projects/:projectId/clips/:clipId
POST   /projects/:projectId/clips/:clipId/regenerate

GET    /projects/:projectId/summary
PATCH  /projects/:projectId/summary

POST   /projects/:projectId/render
GET    /projects/:projectId/outputs
GET    /projects/:projectId/outputs/:outputId/download

GET    /billing/credits
POST   /billing/checkout
POST   /billing/webhook
```

---

## 24. Recommended Build Order

RepurposePro should be built as **vertical slices**, not as isolated frontend, backend, database, AI, or worker phases.

The canonical execution order is:

| Slice | User Outcome |
|---|---|
| VS0 | Repo boots and core infrastructure is ready |
| VS1 | User can sign up, log in, and see protected dashboard |
| VS2 | User can create a project and upload a validated video |
| VS3 | User can buy credits and start a paid processing job |
| VS4 | User receives AI-generated clip previews from an uploaded video |
| VS5 | User can edit one clip preview before rendering |
| VS6 | User can render and download one final vertical MP4 clip |
| VS7 | User can manage multiple clips and regenerate a bad one |
| VS8 | User can generate, edit, render, and download a summary video |
| VS9 | Failed processing automatically refunds credits and explains why |
| VS10 | Files expire and are deleted after 7 days |
| VS11 | Critical security, abuse protection, and reliability are hardened |
| VS12 | Full MVP happy path is tested, responsive, and demo-ready |

By the end of **VS6**, the first complete core journey should work end to end:

```text
sign up
-> upload video
-> buy/use credits
-> process in background
-> receive AI preview
-> edit one clip
-> render
-> download MP4
```

Detailed execution steps live in `build-plan.md`. Coding-agent status, timestamps, blockers, verification, and handoff state live in `progress-tracker.md`.


---

## 25. Main Technical Risks

### 1. Self-hosted Whisper performance

Long videos may be slow on a local worker machine, especially without GPU acceleration.

Mitigation:

- Limit MVP to 30 minutes
- Queue jobs
- Show progress states
- Consider faster Whisper implementations
- Add GPU support later

### 2. Caption timing accuracy

Good captions may require word-level timestamps.

Mitigation:

- Start with segment-level or phrase-level captions
- Add word-level timing later
- Allow users to edit caption text

### 3. Face-aware crop quality

Face detection may fail or produce unstable framing.

Mitigation:

- Use center crop fallback
- Smooth crop coordinates over time
- Avoid dynamic active-speaker switching in MVP

### 4. Rendering speed

FFmpeg rendering can be slow for multiple clips.

Mitigation:

- Render only after user confirms preview edits
- Render selected clips only
- Queue rendering jobs
- Optimize encoding settings

### 5. Stripe and credit logic

Payment systems can create edge cases.

Mitigation:

- Use immutable credit ledger
- Make webhooks idempotent
- Refund credits automatically on failed jobs
- Do not rely only on stored balance

### 6. Scope creep

The app can easily become a full video editor.

Mitigation:

- Keep MVP editor metadata-based
- Avoid full timeline editing
- Use one output style only
- Defer templates and advanced editing

---

## 26. MVP Success Criteria

The RepurposePro MVP is successful if a user can:

1. Sign up
2. Buy credits
3. Upload a video under 30 minutes and 500 MB
4. Generate AI-selected clip previews
5. Edit clip metadata
6. Render final vertical MP4 clips
7. Download the clips
8. Receive automatic credit refund if processing fails

A strong demo should show:

- A long talking-head video uploaded
- AI-generated clip candidates
- Captions previewed in the browser
- Final rendered vertical clips
- Working credit deduction and refund logic
- Clear job status updates
