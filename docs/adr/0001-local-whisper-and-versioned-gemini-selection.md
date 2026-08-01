# ADR 0001: Local Whisper and Versioned Gemini Clip Selection

- Status: Accepted
- Date: 2026-08-01
- Owners: RepurposePro engineering

## Context

VS4 needs timestamped speech data and ranked clip candidates without uploading the source video to
an AI provider or rendering final media. The worker runs on Node.js, while the supported
`faster-whisper` runtime is Python. Gemini output is probabilistic and must not be trusted as a
database write contract.

## Decision

Transcription runs locally in an isolated Python 3.13 environment with
`faster-whisper==1.2.1`. The Node worker starts Python without a shell, uses CPU/int8 and fixed
English by default, passes only bounded arguments, enforces timeout and abort signals, bounds JSON
output, and deletes temporary WAV files after the durable transcript is available. Retries reuse the
job's existing transcript.

Clip selection uses `@google/genai@2.13.0` and the versioned `clips-v1` contract. Gemini receives
only source duration plus timestamped transcript segments; transcript text is delimited as data, not
instructions. The default model is `gemini-3.5-flash-lite`. Requests require
`application/json` with a JSON Schema, and the worker independently validates the response with Zod,
timestamp bounds, candidate limits, overlap deduplication, and repair retries.

The worker persists validated metadata and browser-caption data only. It does not send raw video to
Gemini and does not render a final MP4 in VS4.

## Consequences

- Worker hosts need Python 3.13, the pinned package, FFmpeg, and local model storage. The first model
  download is operationally significant.
- `GEMINI_API_KEY` is optional at worker startup but required for a live selection. Missing keys fail
  analysis safely without weakening validation.
- Prompt changes require a new prompt version and explicit migration/compatibility decision.
- Automated tests use deterministic Gemini fakes. A live Gemini smoke remains a release handoff when
  no local key is configured.

## References

- [faster-whisper on PyPI](https://pypi.org/project/faster-whisper/)
- [Google Gen AI SDK for JavaScript](https://www.npmjs.com/package/%40google/genai)
- [Gemini model guidance](https://ai.google.dev/gemini-api/docs/latest-model)
