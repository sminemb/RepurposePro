# RepurposePro Architecture

## 1. Overview

**RepurposePro** is a web app that turns long podcast and talking-head videos into short vertical clips and condensed summary videos.

The system is designed around a preview-before-render workflow:

1. User uploads a video.
2. User pays with credits before processing.
3. Backend queues a background processing job.
4. Local worker transcribes and analyzes the video.
5. App shows editable preview clips using metadata.
6. User selects and edits clips.
7. Worker renders final MP4 exports with FFmpeg.

The architecture separates the user-facing app, API backend, queue system, and heavy video processing worker.

---

## 2. High-Level Architecture

```text
+-------------------------+
|      Next.js App        |
|-------------------------|
| Dashboard               |
| Upload UI               |
| Credit purchase UI      |
| Preview editor          |
| Export/download UI      |
+-----------+-------------+
            |
            | HTTPS
            v
+-------------------------+
|      NestJS API         |
|-------------------------|
| Auth integration        |
| Project API             |
| Upload handling         |
| Billing API             |
| Job orchestration       |
| Metadata API            |
+-----+-------------+-----+
      |             |
      |             |
      v             v
+-----------+   +----------------+
| Postgres  |   | Redis + BullMQ |
|-----------|   |----------------|
| Users     |   | Processing     |
| Projects  |   | queues         |
| Jobs      |   | retries        |
| Credits   |   | progress       |
| Metadata  |   | job state      |
+-----------+   +-------+--------+
                        |
                        | Job payload
                        v
              +---------------------+
              | Local Worker        |
              |---------------------|
              | FFmpeg probe/render |
              | Whisper transcription |
              | Gemini analysis     |
              | Face-aware crop     |
              | File cleanup        |
              +----------+----------+
                         |
                         v
              +---------------------+
              | File Storage        |
              |---------------------|
              | Source videos       |
              | Temp files          |
              | Transcripts         |
              | Rendered MP4s       |
              +---------------------+
```

---

## 3. Core Components

## 3.1 Frontend: Next.js

The frontend is responsible for the user experience.

### Responsibilities

- Authentication pages
- Project dashboard
- Video upload interface
- Credit purchase interface
- Processing status display
- Preview editor
- Caption overlay preview
- Trim controls
- Clip deletion
- Clip regeneration request
- Render/export request
- Download links

### Key Pages

```text
/
 /login
 /signup
 /dashboard
 /projects
 /projects/:projectId
 /projects/:projectId/upload
 /projects/:projectId/processing
 /projects/:projectId/clips
 /projects/:projectId/summary
 /projects/:projectId/outputs
 /billing
```

### UI Stack

- Next.js
- shadcn/ui
- Tailwind CSS v4

### Preview Editor Strategy

The editor should be metadata-based, not a full video timeline editor.

The frontend should preview clips with:

- HTML video player
- Source video URL
- Start and end timestamps
- CSS caption overlays
- CSS crop preview when possible
- Local UI state for unsaved changes
- API persistence for saved clip metadata

The frontend should not render MP4 files. Final rendering belongs to the worker.

---

## 3.2 Backend: NestJS API

The backend coordinates users, projects, uploads, billing, jobs, and metadata.

### Responsibilities

- Auth integration with Better Auth
- User session validation
- Project CRUD
- Upload validation
- File metadata storage
- FFmpeg duration probing coordination
- Credit balance and ledger
- Stripe Checkout session creation
- Stripe webhook handling
- BullMQ job creation
- Job status updates
- Clip and summary metadata APIs
- Render job creation
- Download authorization
- File retention policy

### Backend Design Principles

- Keep heavy processing out of the API process.
- Do not block API requests on transcription, AI analysis, or rendering.
- Store every credit movement in the credit ledger.
- Treat worker jobs as resumable and failure-aware.
- Make Stripe webhooks idempotent.
- Keep file access authenticated or signed.

---

## 3.3 Queue: Redis + BullMQ

BullMQ handles all long-running and asynchronous work.

### Queue Types

Recommended queues:

```text
video-analysis-queue
video-render-queue
cleanup-queue
```

### Job Types

```text
analyze_video
render_clips
render_summary
regenerate_clip_candidate
cleanup_expired_project_files
```

### Why Use Separate Queues?

Separate queues make it easier to:

- Prioritize rendering over analysis
- Limit concurrent heavy jobs
- Retry failed jobs independently
- Scale workers later
- Keep cleanup jobs isolated

### Recommended Concurrency

For a local worker machine:

```text
analysis concurrency: 1
render concurrency: 1
cleanup concurrency: 1
```

Increase only after measuring CPU, RAM, GPU, disk, and FFmpeg performance.

---

## 3.4 Database: PostgreSQL + Drizzle ORM

Postgres stores durable application state.

### Responsibilities

- Users
- Projects
- Upload records
- Processing jobs
- Transcripts
- Clip candidates
- Summary segments
- Rendered outputs
- Credit ledger
- Stripe records
- File retention metadata

### Important Rule

Do not rely only on a stored `credits_balance` field.

Use an immutable credit ledger and derive or reconcile balances from ledger entries.

---

## 3.5 Local Worker Machine

The local worker handles CPU/GPU-heavy processing.

### Responsibilities

- Pull jobs from BullMQ
- Access uploaded video files
- Probe video metadata with FFmpeg
- Transcribe audio with self-hosted Whisper
- Send timestamped transcript to Gemini
- Parse Gemini structured JSON
- Generate face-aware crop metadata
- Generate preview metadata
- Render final MP4 files with FFmpeg
- Update job progress
- Mark jobs completed or failed
- Trigger credit refunds on failure through backend-safe logic

### Worker Dependencies

- FFmpeg
- Whisper or faster-whisper
- Python runtime if Whisper pipeline is Python-based
- Node.js if using a TypeScript worker
- Face detection library
- Gemini API client
- Access to file storage
- Redis connection
- Backend service credentials or internal API token

### Worker Design Options

Option A: **NestJS worker process**

- Same language as backend
- Easy BullMQ integration
- Good for orchestration
- May need child processes for Python Whisper

Option B: **Python worker**

- Easier Whisper and ML tooling
- More natural for face detection
- Requires queue integration or internal worker API

Recommended MVP:

```text
Use a Node/NestJS BullMQ worker for orchestration.
Call Python scripts for Whisper and face detection when needed.
Use FFmpeg through child_process.
```

---

## 3.6 File Storage

For MVP, storage can be local disk if the app is running in a controlled environment.

Future production should use object storage such as S3-compatible storage.

### Stored File Types

```text
source video
extracted audio
transcript JSON
preview metadata JSON
temporary render files
final rendered MP4 clips
final rendered summary MP4
thumbnail images
```

### Storage Layout Example

```text
/storage
  /users
    /:userId
      /projects
        /:projectId
          /source
            original.mp4
          /audio
            audio.wav
          /transcripts
            transcript.json
          /metadata
            clips.json
            summary.json
            crop.json
          /renders
            clips
              clip-001.mp4
              clip-002.mp4
            summary
              summary.mp4
          /temp
```

### Retention Policy

Files should be automatically deleted after 7 days.

Delete:

- Uploaded source videos
- Extracted audio
- Temp files
- Rendered clips
- Rendered summary videos
- Preview assets

Keep:

- User account records
- Payment records
- Credit ledger records
- Minimal project/job metadata

---

## 4. Main Data Flow

## 4.1 Upload and Payment Flow

```text
User
 |
 | Uploads video
 v
Next.js
 |
 | POST /projects/:projectId/upload
 v
NestJS API
 |
 | Validate file size and format
 | Store upload metadata
 | Probe duration
 | Calculate credits required
 v
Postgres
 |
 | Save uploaded_video record
 | Save project status
 v
User
 |
 | Pays with credits or buys credits through Stripe
 v
NestJS API
 |
 | Deduct credits
 | Create credit ledger entry
 | Create processing job
 v
BullMQ
 |
 | analyze_video job
 v
Worker
```

### Rules

- Maximum file size: 500 MB
- MVP maximum duration: 30 minutes
- Charge before processing
- Deduct credits before queueing analysis
- Refund credits automatically if processing fails

---

## 4.2 Analysis Flow

```text
BullMQ analyze_video job
 |
 v
Worker
 |
 | FFmpeg extracts audio
 | Whisper transcribes audio
 | Transcript is saved
 | Gemini analyzes transcript
 | Face-aware crop metadata is generated
 | Clip or summary preview metadata is saved
 v
Postgres + File Storage
 |
 | Job status = Preview ready
 v
Next.js
 |
 | User edits previews
```

### Analysis Output

For clip projects:

- 5–10 primary clip candidates
- Backup candidates for regeneration
- Caption text
- Highlighted keywords
- Start and end timestamps
- AI selection reason
- Crop metadata

For summary projects:

- Ordered segment list
- Target duration
- Segment reasons
- Optional captions if summary captions are enabled later

---

## 4.3 Preview Editing Flow

```text
User
 |
 | Opens preview editor
 v
Next.js
 |
 | GET /projects/:projectId/clips
 v
NestJS API
 |
 | Returns clip metadata
 v
Next.js
 |
 | Uses source video + timestamps for preview
 | Uses CSS overlays for captions
 | User edits metadata
 |
 | PATCH /projects/:projectId/clips/:clipId
 v
NestJS API
 |
 | Saves metadata changes
 v
Postgres
```

### Editable Clip Metadata

- Start time
- End time
- Caption text
- Caption position
- Caption font size
- Captions enabled/disabled
- Highlighted words
- Selected/deleted state

No MP4 rendering should happen during normal metadata edits.

---

## 4.4 Final Render Flow

```text
User
 |
 | Clicks Render / Export
 v
Next.js
 |
 | POST /projects/:projectId/render
 v
NestJS API
 |
 | Creates render job
 | Job status = Rendering
 v
BullMQ
 |
 | render_clips or render_summary job
 v
Worker
 |
 | FFmpeg trims source video
 | Applies vertical crop
 | Burns captions
 | Encodes MP4
 | Saves outputs
 v
Postgres + File Storage
 |
 | Job status = Completed
 | Output records created
 v
Next.js
 |
 | User downloads MP4s
```

### Render Rules

- Render only selected clips.
- Use latest saved metadata.
- Do not charge extra for initial final render in MVP.
- Regenerated clips within the same paid project are included.
- Failed render should refund credits if no usable output is produced.

---

## 5. Job State Machine

## 5.1 Analysis Job States

```text
Uploaded
  -> Waiting for payment
  -> Queued
  -> Transcribing
  -> Analyzing
  -> Preview ready
  -> Waiting for user edits
  -> Rendering
  -> Completed
```

## 5.2 Failure States

```text
Failed
Refunded
Deleted
```

## 5.3 State Descriptions

| State | Meaning |
|---|---|
| Uploaded | Video has been uploaded and stored |
| Waiting for payment | Credits are required before processing |
| Queued | Job has been placed in BullMQ |
| Transcribing | Worker is running Whisper |
| Analyzing | Worker is using Gemini and generating metadata |
| Preview ready | User can review clips or summary segments |
| Waiting for user edits | User has preview access and can modify metadata |
| Rendering | Worker is rendering final MP4 files |
| Completed | Final outputs are ready |
| Failed | Job failed |
| Refunded | Credits were refunded after failure |
| Deleted | Files were deleted manually or by retention job |

---

## 6. Recommended Database Schema

This is a conceptual schema. Exact Drizzle definitions can be created from this.

## 6.1 users

Stores application users.

```text
id
email
name
created_at
updated_at
```

Better Auth may create or manage its own auth-related tables. Keep app-specific profile fields separate if needed.

---

## 6.2 projects

Represents a user project.

```text
id
user_id
name
type                    // clips or summary
status
created_at
updated_at
expires_at
deleted_at
```

---

## 6.3 uploaded_videos

Stores uploaded source video metadata.

```text
id
project_id
user_id
original_filename
storage_path
mime_type
file_size_bytes
duration_seconds
width
height
fps
status
created_at
expires_at
deleted_at
```

---

## 6.4 processing_jobs

Tracks background job state.

```text
id
project_id
user_id
bullmq_job_id
type                    // analyze_video, render_clips, render_summary
status
progress_percent
current_step
error_code
error_message
credits_charged
credits_refunded
started_at
completed_at
failed_at
created_at
updated_at
```

---

## 6.5 transcripts

Stores transcript metadata.

```text
id
project_id
uploaded_video_id
storage_path
language
duration_seconds
word_timestamps_available
created_at
```

---

## 6.6 transcript_segments

Stores searchable transcript segments.

```text
id
transcript_id
project_id
start_time
end_time
text
confidence
sequence_index
created_at
```

---

## 6.7 clip_candidates

Stores AI-generated candidate clips and user edits.

```text
id
project_id
transcript_id
status                  // active, deleted, backup, rendered
title
start_time
end_time
ai_score
ai_reason
transcript_excerpt
caption_text
caption_enabled
caption_position_x
caption_position_y
caption_font_size
caption_highlight_words
crop_x
crop_y
crop_width
crop_height
is_selected
is_backup
source                  // initial, regeneration
created_at
updated_at
```

---

## 6.8 summary_segments

Stores summary video segments.

```text
id
project_id
transcript_id
start_time
end_time
sequence_index
reason
is_selected
created_at
updated_at
```

---

## 6.9 rendered_outputs

Stores final MP4 output records.

```text
id
project_id
user_id
clip_candidate_id       // nullable for summary output
type                    // clip or summary
storage_path
filename
file_size_bytes
duration_seconds
width
height
status
created_at
expires_at
deleted_at
```

---

## 6.10 credit_ledger

Stores immutable credit transactions.

```text
id
user_id
project_id              // nullable
processing_job_id       // nullable
stripe_payment_id       // nullable
type                    // purchase, processing_deduction, refund, manual_adjustment
amount
balance_after
description
created_at
```

### Ledger Rules

- Purchases are positive amounts.
- Processing deductions are negative amounts.
- Refunds are positive amounts.
- Never delete ledger entries.
- Use database transactions when updating ledger and balance.

---

## 6.11 stripe_customers

Maps users to Stripe customers.

```text
id
user_id
stripe_customer_id
created_at
updated_at
```

---

## 6.12 stripe_payments

Tracks Stripe payment events.

```text
id
user_id
stripe_customer_id
stripe_checkout_session_id
stripe_payment_intent_id
amount_cents
currency
credits_purchased
status
raw_event_id
created_at
updated_at
```

---

## 7. API Design

## 7.1 Project Endpoints

```text
POST   /projects
GET    /projects
GET    /projects/:projectId
PATCH  /projects/:projectId
DELETE /projects/:projectId
```

---

## 7.2 Upload Endpoints

```text
POST   /projects/:projectId/upload
GET    /projects/:projectId/video
DELETE /projects/:projectId/video
```

Upload endpoint should:

- Require authentication
- Check file size
- Check MIME type
- Save file
- Probe metadata
- Store duration
- Calculate required credits

---

## 7.3 Processing Endpoints

```text
POST   /projects/:projectId/analyze
GET    /projects/:projectId/jobs/:jobId/status
GET    /projects/:projectId/status
```

Analysis endpoint should:

- Require credits
- Deduct credits
- Create credit ledger entry
- Create BullMQ job
- Return job ID

---

## 7.4 Clip Endpoints

```text
GET    /projects/:projectId/clips
GET    /projects/:projectId/clips/:clipId
PATCH  /projects/:projectId/clips/:clipId
DELETE /projects/:projectId/clips/:clipId
POST   /projects/:projectId/clips/:clipId/regenerate
```

Clip patch endpoint should support metadata edits:

- Start time
- End time
- Caption text
- Caption enabled
- Caption position
- Caption font size
- Highlighted words
- Selected/deleted state

---

## 7.5 Summary Endpoints

```text
GET    /projects/:projectId/summary
PATCH  /projects/:projectId/summary
```

Summary patch endpoint should support:

- Segment selection
- Start/end adjustment
- Segment deletion
- Segment ordering if allowed

For MVP, preserve chronological order.

---

## 7.6 Render Endpoints

```text
POST   /projects/:projectId/render
GET    /projects/:projectId/outputs
GET    /projects/:projectId/outputs/:outputId/download
DELETE /projects/:projectId/outputs/:outputId
```

Render endpoint should:

- Create a render job
- Render only selected clips or selected summary segments
- Use latest metadata
- Return render job status

---

## 7.7 Billing Endpoints

```text
GET    /billing/credits
GET    /billing/ledger
POST   /billing/checkout
POST   /billing/webhook
```

Billing rules:

- Webhooks must be idempotent.
- Credits should only be granted after confirmed payment.
- Credit deductions should happen before processing.
- Failed processing should issue credit refunds.

---

## 8. Queue Design

## 8.1 analyze_video Job Payload

```json
{
  "projectId": "project_id",
  "userId": "user_id",
  "uploadedVideoId": "uploaded_video_id",
  "outputType": "clips",
  "requestedClipCount": 10
}
```

## 8.2 render_clips Job Payload

```json
{
  "projectId": "project_id",
  "userId": "user_id",
  "clipIds": ["clip_id_1", "clip_id_2"]
}
```

## 8.3 render_summary Job Payload

```json
{
  "projectId": "project_id",
  "userId": "user_id",
  "summarySegmentIds": ["segment_id_1", "segment_id_2"]
}
```

## 8.4 cleanup_expired_project_files Job Payload

```json
{
  "projectId": "project_id"
}
```

---

## 9. Worker Pipeline Details

## 9.1 Video Metadata Probe

Use FFmpeg or ffprobe to extract:

- Duration
- Width
- Height
- FPS
- Audio stream presence
- Codec
- Container format

Reject or fail gracefully if:

- No audio stream exists
- Duration exceeds MVP limit
- File is corrupted
- Unsupported codec cannot be decoded

---

## 9.2 Audio Extraction

Extract audio for transcription.

Example output:

```text
audio.wav
```

Recommended audio settings:

```text
mono
16 kHz
wav
```

---

## 9.3 Whisper Transcription

Run self-hosted Whisper.

Expected output:

```json
{
  "language": "en",
  "duration": 1800,
  "segments": [
    {
      "start": 0.0,
      "end": 4.2,
      "text": "Welcome back to the show..."
    }
  ]
}
```

Use word-level timestamps if the selected Whisper implementation supports them with acceptable performance.

---

## 9.4 Gemini Clip Analysis

Send Gemini the timestamped transcript, not the raw video.

Prompt should request structured JSON.

Criteria:

- Strong hook
- Emotional reaction
- Useful insight
- Standalone context
- Clean start and ending
- Low filler

The model should return both selected clips and backup candidates.

---

## 9.5 Gemini Summary Analysis

Send Gemini the timestamped transcript.

Prompt should request chronological segment selection.

Rules:

- Preserve original order
- Target 10% of original duration
- Keep original speaker audio
- Remove filler and repetition
- Prefer coherent context

---

## 9.6 Face-Aware Crop Metadata

Generate crop metadata before preview.

For MVP:

- Sample frames every few seconds
- Detect faces
- Estimate stable crop region
- Smooth crop positions
- Store crop rectangle
- Fallback to center crop

Crop metadata example:

```json
{
  "crop": {
    "x": 420,
    "y": 0,
    "width": 1080,
    "height": 1920,
    "mode": "face_aware",
    "fallback": false
  }
}
```

---

## 9.7 FFmpeg Final Rendering

Final rendering should use saved metadata.

For clips:

- Trim source
- Crop to 9:16
- Burn captions if enabled
- Encode MP4

For summary:

- Trim selected segments
- Concatenate in chronological order
- Preserve original audio
- Encode MP4

---

## 10. Caption Architecture

## 10.1 Caption Metadata

Store captions as editable metadata before render.

Suggested structure:

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

## 10.2 Preview Captions

In the browser:

- Use absolutely positioned HTML/CSS overlays
- Sync captions to video `currentTime`
- Highlight keywords with spans
- Let users adjust position and font size

## 10.3 Rendered Captions

In FFmpeg:

- Convert caption metadata into ASS subtitles or drawtext filters
- Burn captions into the video
- Match browser preview as closely as possible

Recommended MVP:

```text
Use ASS subtitles for caption rendering.
```

ASS subtitles are better than basic SRT for styling, positioning, and highlighted words.

---

## 11. Credit and Billing Architecture

## 11.1 Credit-Based Billing

RepurposePro uses credits.

```text
1 credit = 1 video minute
```

Recommended MVP price:

```text
$0.25 per video minute
```

Suggested packs:

```text
Starter: $10 = 40 credits
Creator: $25 = 100 credits
Pro: $50 = 200 credits
```

## 11.2 Payment Flow

```text
User chooses credit pack
 |
 v
Stripe Checkout
 |
 v
Stripe webhook confirms payment
 |
 v
Backend creates stripe_payment record
 |
 v
Backend adds credits through credit_ledger
 |
 v
User balance updates
```

## 11.3 Processing Deduction Flow

```text
User starts processing
 |
 v
Backend calculates required credits
 |
 v
Backend opens DB transaction
 |
 | Check balance
 | Create processing_deduction ledger entry
 | Update project/job status
 |
 v
Queue analysis job
```

## 11.4 Refund Flow

```text
Processing fails
 |
 v
Worker marks job failed
 |
 v
Backend creates refund ledger entry
 |
 v
Project/job status updates to Refunded
```

### Important

Refund credits, not Stripe payments, for normal processing failures.

Stripe refunds should only be used when you want to return actual money to the user.

---

## 12. Security Architecture

## 12.1 Authentication

Use Better Auth for:

- Signup
- Login
- Session management
- Protected routes
- User identity

## 12.2 Abuse Protection

Use Arcjet for:

- Rate limiting
- Bot protection
- Signup protection
- Upload protection
- API abuse protection

## 12.3 File Security

Rules:

- Require authentication for file access.
- Ensure users can access only their own projects.
- Use signed URLs or backend-mediated downloads.
- Do not expose raw local file paths.
- Validate uploaded file MIME type and extension.
- Probe video before accepting for processing.
- Enforce file size and duration limits.

## 12.4 Worker Security

Worker should:

- Use internal credentials
- Trust only jobs from Redis/BullMQ
- Validate project and file existence before processing
- Never accept arbitrary shell commands from job payloads
- Sanitize file paths
- Use safe child process execution
- Store errors without exposing sensitive environment variables

## 12.5 Stripe Webhook Security

Stripe webhook endpoint must:

- Verify webhook signature
- Be idempotent
- Store processed event IDs
- Never grant credits twice for the same event
- Handle retries safely

---

## 13. Error Handling

## 13.1 Failure Categories

Handle these failures explicitly:

- Upload failed
- Invalid file type
- File too large
- Video too long
- FFmpeg probe failed
- No audio track
- Whisper transcription failed
- Gemini analysis failed
- Invalid Gemini JSON
- Face detection failed
- FFmpeg render failed
- Storage write failed
- Worker crashed
- Redis unavailable
- Stripe webhook failed
- Insufficient credits

## 13.2 Refund Rules

Refund credits if:

- Transcription fails
- AI analysis fails
- Rendering fails and no usable output is produced
- Worker crashes and the job cannot be recovered

Do not refund credits if:

- User deletes the project after successful processing
- User does not like the AI-selected clips but processing succeeded
- User chooses not to render after preview metadata is generated

This can be adjusted later, but MVP rules should be explicit.

## 13.3 Retry Rules

Recommended retries:

```text
Upload: no automatic retry
Whisper: 1 retry
Gemini: 2 retries
FFmpeg render: 1 retry
Cleanup: 3 retries
Stripe webhook: handled by Stripe retry + idempotency
```

---

## 14. Observability

For MVP, log enough to debug processing issues.

### Log Events

- User signup
- Credit purchase
- Credit deduction
- Credit refund
- Upload received
- Video metadata probed
- Job queued
- Job started
- Transcription started/completed
- Gemini analysis started/completed
- Preview ready
- Render started/completed
- Job failed
- Files deleted

### Metrics to Track

- Upload count
- Average uploaded duration
- Average transcription time
- Average analysis time
- Average render time
- Failure rate by step
- Credits purchased
- Credits deducted
- Credits refunded
- Storage used
- Queue wait time

---

## 15. Deployment Architecture

## 15.1 MVP Local/Portfolio Deployment

Recommended MVP setup:

```text
Next.js app: hosted on Vercel or similar
NestJS API: VPS or container host
Postgres: managed Postgres or local VPS Postgres
Redis: managed Redis or local VPS Redis
Worker: local machine connected to Redis
Storage: local disk or mounted volume
```

### Important Concern

If the worker runs on a local machine, it must reliably access:

- Redis
- Backend API
- File storage
- Environment variables
- FFmpeg
- Whisper runtime

For a portfolio MVP, this is acceptable.

For production, move workers to cloud GPU/CPU instances.

---

## 15.2 Future Production Deployment

Future architecture:

```text
Frontend: Vercel
API: containerized NestJS service
Database: managed Postgres
Queue: managed Redis
Storage: S3-compatible object storage
Workers: autoscaled CPU/GPU machines
CDN: for download delivery
Monitoring: centralized logs and metrics
```

---

## 16. Environment Variables

Possible environment variables:

```text
DATABASE_URL=
REDIS_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
ARCJET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_CREATOR=
STRIPE_PRICE_PRO=
GEMINI_API_KEY=
STORAGE_ROOT=
WORKER_INTERNAL_TOKEN=
APP_URL=
API_URL=
MAX_UPLOAD_SIZE_MB=500
MAX_VIDEO_DURATION_SECONDS=1800
FILE_RETENTION_DAYS=7
```

---

## 17. MVP Build Order

Build in this order:

1. Auth and protected dashboard
2. Project creation
3. Video upload
4. FFmpeg metadata probe
5. Credit model and ledger
6. Stripe Checkout
7. Stripe webhook handling
8. Credit deduction before processing
9. Redis and BullMQ setup
10. Local worker setup
11. Whisper transcription
12. Transcript persistence
13. Gemini clip selection
14. Clip preview metadata persistence
15. Preview editor UI
16. Caption overlay preview
17. Trim metadata editing
18. Clip deletion
19. Clip regeneration from backup candidates
20. FFmpeg final clip rendering
21. MP4 output download
22. Gemini summary segment selection
23. Summary preview
24. Summary final rendering
25. Cleanup job for 7-day retention
26. Failure handling and automatic credit refund
27. Dashboard polish

---

## 18. MVP Architecture Success Criteria

The architecture is successful if RepurposePro can:

1. Accept an authenticated user's uploaded video.
2. Validate size and duration limits.
3. Charge credits before processing.
4. Queue processing without blocking the API.
5. Transcribe video on a local worker.
6. Generate AI-selected clip or summary metadata.
7. Show editable previews before rendering.
8. Render selected clips or summary into MP4.
9. Let the user download final outputs.
10. Refund credits automatically when processing fails.
11. Delete files automatically after 7 days.
12. Keep payment and credit history auditable.
