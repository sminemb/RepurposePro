# VS4-T1 Gated Worker Lifecycle Plan

## Goal

Add a strict, tested BullMQ analysis-job processor boundary through
`ProcessingLifecycleService` without enabling production queue consumption before
the remaining VS4 pipeline can complete truthfully.

## Scope

1. Validate BullMQ job name, job ID, and strict ID-only payload before protected work.
2. Create one execution identity per callback and acquire the PostgreSQL execution lease.
3. Forward lease token, abort signal, and token-bound progress updates to an injected pipeline.
4. Require an explicit `preview_ready` result before processor success.
5. Classify malformed or rejected work as unrecoverable and busy leases as retryable.
6. Keep the processor unregistered from the production worker module.

## Constraints

- Do not modify migration `0017` or financial state.
- Do not add FFmpeg, Whisper, Gemini, polling, or preview persistence behavior.
- Add failing tests before implementation.
- Keep HTTP APIs, shared queue payloads, and database schema unchanged.
- Verify formatting, lint, typecheck, tests, builds, and whitespace before commit.

## Acceptance

- Invalid queue data never reaches lease acquisition or the pipeline.
- Valid work enters `ProcessingLifecycleService` with a fresh execution identity.
- Pipeline receives the exact lease context and can report token-bound progress.
- Only explicit `preview_ready` completion resolves successfully.
- Production BullMQ consumption remains disabled until T2-T6 are complete.
