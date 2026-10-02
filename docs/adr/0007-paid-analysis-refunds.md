# ADR 0007 — Paid analysis refunds and bounded recovery

Date: 2026-10-02. Status: Accepted for VS9.

A valid, durably saved clip or summary preview fulfills the paid analysis. Terminal failures
before that publication refund the exact analysis deduction once. Automatic attempts do not
charge again. Rendering and regeneration remain free, preserve previews and older downloads,
and never refund a successful analysis. Cancellation, deletion after success and dissatisfaction
with valid AI selections are not eligible.

PostgreSQL remains authoritative: restricted operations verify ownership, exact deductions,
execution leases and preview completion. The refund ledger entry and terminal job/project state
commit atomically. The first accepted reason and eligibility remain immutable. Historical refund
replays verify the original ledger without changing a newer current job.

Paid analysis persists per-stage budgets before external work: two transcription attempts
(audio extraction plus Whisper) and three selection calls total (Gemini transport and response
repair share this budget). Cached transcripts are reused. Token-fenced budgets survive crashes
and takeover; queue delivery cannot reset them. Lease loss aborts work. Terminal worker failures
persist a safe, specific intent before relinquishing execution; API sweepers finalize the refund.
Queue events and reconciliation recover missing delivery without trusting raw exception text.

The processing UI displays pending settlement separately from confirmed credits. Confirmed amounts
come from the immutable ledger. A settled refunded project may start a fresh paid analysis using
its retained source, after explicit cost confirmation. A new job gets its own deduction and budget;
old jobs, refund entries and failure reasons remain auditable.

Forward migrations must precede service startup. Existing terminal reasons are not rewritten.
Scheduled deletion remains VS10. See the VS9 verification document for executed evidence.
