# Local portfolio demo

Use a fresh account and the existing private file
`storage/debug-inputs/repurposepro-processing-repro.mp4`. It is a 445.067-second, 1920×1080
English talk-show excerpt with two visible speakers. Use a desktop browser at 1440×900 for editing.
Allow time for local CPU transcription, tracking and rendering; progress is a stage estimate.

## Startup checks

1. Use Node 22.18.x and pnpm 11.10.x. Run `pnpm install --frozen-lockfile` with normal security
   policies. Keep configured `.env` and `.env.database` private. On a new machine, copy the
   example files. Create `.venv/whisper` with Python 3.13 and install
   `apps/worker/python/requirements-whisper.lock.txt`. Follow
   [ADR 0003](adr/0003-person-tracking-and-caption-colors.md#setup-and-deployment) for the pinned
   framing runtime/model; set the corresponding Python paths in `.env`.
2. Confirm FFmpeg/ffprobe, the configured Whisper Python environment and framing model are
   available. Confirm Gemini credentials and configured clip/summary models are enabled.
3. Run `pnpm infra:up`, `pnpm db:migrate`, then `pnpm infra:check`.
4. Configure Stripe sandbox prices for the displayed packs and authenticate the Stripe CLI.
   Its listener signing secret must match `STRIPE_WEBHOOK_SECRET` in ignored `.env`.
   Keep test-mode credentials; the Checkout page must display **Sandbox**.
5. Run `pnpm dev`. Wait for web on `http://localhost:3000`, API readiness at
   `http://localhost:4000/api/v1/health/ready`, the worker startup confirmation and the Stripe
   listener's Ready message. Resolve configuration errors before opening the demo.
6. Verify the source plays with audible English speech. Its container has a sample-count
   warning, but full video/audio decoding has passed. Choose material appropriate for the
   intended audience; this local technical demo does not publish the source or outputs.
7. Keep the running stack stable during processing. Do not run production builds, integration
   tests, package rebuilds or source edits while a live worker owns a job. For a rehearsed demo,
   build first, run the API/worker `start` commands, and use `pnpm dev:web` with a separate
   `pnpm stripe:listen`. Local Next development supplies the local client-IP behavior expected
   by the configured Arcjet SDK. Keep protection enabled.

## Fresh account and purchase

1. Open a fresh browser context. At `/signup`, enter a name, a unique synthetic email and a
   password of at least eight characters. Select **Create account**.
2. The dashboard shows an empty workspace and zero credits. Open **Billing**.
3. Select the **Starter** pack: $10 for 40 credits. In real Stripe **Sandbox** Checkout, use
   test card `4242 4242 4242 4242`, a future expiry, any three-digit CVC and a synthetic name.
   Select USD if Stripe offers local currency conversion; the app's configured price is USD.
4. Complete Checkout and return to Billing. Wait for 40 credits and one +40 **Credit purchase** entry.
   A return URL alone is not proof of payment; the signed webhook must fulfill the purchase.

## Clips journey

1. Select **New project**, name it “Portfolio talk-show clips”, and choose **Short clips**.
   Select **Create project** to reach the upload page.
2. Choose the source file and select **Upload video**. Wait for **Upload complete** and
   validated duration/dimensions. Review the cost: eight credits for 7 minutes 25 seconds.
3. Select **Start processing for 8 credits**. Show the processing stage and explain that the
   worker continues if the page is closed. The dashboard balance becomes 32.
4. Analysis navigates to `/projects/<id>/clips`. Play a candidate and review speech/captions.
   Inspect person tracking and framing. Select the subject appropriate to that moment if
   automatic framing does not follow the desired speaker; save the choice.
5. Adjust trim, edit a caption phrase if necessary, and select **Save changes**. Reload and
   confirm the saved values remain. Select one candidate for the short demonstration.
6. Select **Render Selected Clips**. Rendering is free. The outputs page shows real progress
   and offers **Download MP4** only when the file is ready.
7. Download and play the MP4. Confirm intelligible speech, readable captions, useful vertical
   framing, and no unexpected cut or silent audio. Expect 1080×1920 H.264/AAC and a duration
   matching the saved trim. The balance stays 32; earlier exports remain separate attempts.

## Summary journey

1. Create “Portfolio talk-show summary”, choose **Summary video**, and upload the same source.
   Confirm **Summary video** is selected before creating the project; its dashboard card also
   shows Summary video. Review and confirm the
   second eight-credit analysis. The balance becomes 24.
2. Analysis navigates to `/projects/<id>/summary`. The initial selection targets approximately
   10% of the source in chronological order, preserving original picture/audio without captions.
3. Play the continuous preview and a segment. Refine a cut or remove a less useful segment.
   Save, reload, and verify the changes. Removed segments can be restored.
4. Select **Render Summary**. Unsaved valid edits are saved before rendering; no additional
   credits are charged. Download the ready MP4 and check continuity at every join.
5. Confirm source-shaped even dimensions, H.264/AAC, audible speech and duration equal to the
   sum of saved selected ranges. Billing should contain one +40 purchase and two -8 charges,
   ending at 24 credits for a successful rehearsal.

## Supported recovery

- If signup, Checkout or project creation reports temporary protection unavailability, wait
  briefly and use the same visible action again. Protection remains enabled. Respect any
  displayed retry interval; do not disable guards or change database rows.
- If Checkout returns before confirmation, wait for the listener/webhook. Refresh Billing to
  check balance/history; do not purchase twice merely because confirmation is delayed.
- Upload validation failures are recoverable before analysis. Choose a supported local file
  within 500 MB and 30 minutes. A successful existing upload does not need re-uploading.
- If the analysis start reports queue unavailability, retry the same confirmation after queue
  readiness. Durable dispatch reuses the accepted job without a second charge.
- An eligible terminal analysis failure shows a pending full refund, followed by confirmation.
  Only then select **Try analysis again**, review cost/balance, and explicitly confirm a new
  paid attempt. Saved usable previews do not qualify for an analysis refund.
- Save or discard unsaved edits when the leave dialog appears. Rendering can save valid current
  edits first. Reload a saved version if another tab changed its revision.
- A render failure retains saved edits and previous downloads. Retry the failed selected clips
  or summary for free. Avoid starting another render while one is active.
- An expired download is unavailable. Re-render for free while its source is retained. If the
  source has expired, create a new project and upload again; metadata/history remain available.

## Completion and test separation

Keep downloads, screenshots and logs under ignored `storage/vs12-live`. Record actual start/end
times, balances, saved ranges, output properties and visual/audio observations in
`docs/verification/vs12.md`. Complete both downloads without manual database changes.

`pnpm test:e2e` runs a separate disposable stack with deterministic external-provider fixtures.
It creates and removes only its unique Docker project, queue namespace and test-owned storage.
Install its Chromium browser with `pnpm exec playwright install chromium` first. The normal
`pnpm ci:check` includes this deterministic gate after production builds. Real-provider demos
use the normal startup above and are deliberately separate from CI.

Rehearsed on 2026-10-03 with a fresh account and real providers. The audit also reproduced and
fixed an extra-project retry defect, so its final balance was 16; a clean run following the fixed
flow uses two eight-credit analyses and ends at 24. See the full timings, credit ledger explanation,
media properties and refinement results in [VS12 verification](verification/vs12.md).
