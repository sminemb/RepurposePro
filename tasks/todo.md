# VS3-R2 Checklist

- [x] Read the task brief, tracker, architecture, contracts, schema, standards,
      environment, and current library documentation.
- [x] Confirm clean baseline at commit `5150a0f`.
- [x] Record VS3-R2 as in progress.
- [x] Add RED unit and live integration regressions for all six defects.
- [x] Add forward migration `0016`.
- [x] Implement dedicated Redis/BullMQ connection ownership.
- [x] Implement immutable processing failures and durable intent sweeping.
- [x] Implement queued/active dispatch reconciliation and execution leases.
- [x] Implement the global safe exception filter.
- [x] Implement durable Stripe receipt state transitions and replay.
- [x] Run formatting, tests, integration checks, lint, typecheck, builds, and
      whitespace validation.
- [x] Perform adversarial review and resolve findings.
- [x] Update execution, operational, tracker, and handoff records; maintenance log
      is not applicable to this product reliability task.
- [x] Commit the verified VS3-R2 changes.
