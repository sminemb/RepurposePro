# Person framing and caption colors verification

Verified locally on 2026-09-28.

The full `pnpm ci:check` gate passed: formatting, lint, type checks, 526 unit tests,
63 PostgreSQL integration tests, and all production builds. Four Python tracker tests
also passed. Migrations 0023/0024 were applied successfully to the local database, and
the isolated detector environment and verified model were installed locally.

- Real MediaPipe detection on an eight-second local video segment produced a primary track
  with all 40 samples and a second partial track. The primary person's off-center position
  became centered in the vertical preview.
- Browser checks used the production editor components, compiled application styles, real
  detector output, and a fixture API. The crop moved during playback and returned to the
  correct position on looping. Its video/control rectangle remained stationary.
- Manual dragging changed the crop; keyboard arrow keys adjusted the position slider.
  Manual framing survived Save and reload. Seeking outside a changed trim returned to
  its start. Discard restored the saved settings.
- Yellow caption text, a green highlighted word, and a blue highlighted word appeared
  together. An unsaved draft restored all colors. Save and reload preserved the colors.
  No browser console errors or warnings were observed.
- PostgreSQL integration independently verified persisted colors/framing, legacy omission
  behavior, ownership isolation, revision conflicts, invalid-input atomic rejection,
  source-cache deduplication, and worker lease fencing.
- Python tracking tests cover motion, ambiguous crossings, temporary loss, rotation, and
  display aspect ratio. Shared geometry tests cover portrait/landscape crops, boundaries,
  interpolation, gap holding, and trim-dependent selection.

The browser fixture does not verify authenticated HTTP routing end to end. Controller
tests cover authentication wiring and error responses; database tests cover ownership.
Final MP4 rendering remains outside this feature, as specified in ADR 0003.
