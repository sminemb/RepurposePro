import type { EditorDraft } from "../client/clip-editor-state";
import { formatClipTime, parseClipTime } from "../client/clip-time";

export const editorFieldClass =
  "min-h-11 w-full rounded-rp-md border border-rp-border bg-rp-bg px-3 py-2 text-sm text-rp-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary";
export function TrimControls({
  draft,
  duration,
  error,
  onChange,
}: {
  draft: EditorDraft;
  duration: number;
  error: string;
  onChange: (draft: EditorDraft) => void;
}) {
  const start = parseClipTime(draft.startText);
  const end = parseClipTime(draft.endText);
  const normalize = (field: "startText" | "endText") => {
    const seconds = parseClipTime(draft[field]);
    if (seconds !== null) onChange({ ...draft, [field]: formatClipTime(seconds) });
  };
  return (
    <fieldset className="space-y-3 border-b border-rp-border pb-5">
      <legend className="mb-3 font-semibold text-rp-text">Trim clip</legend>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-2 text-xs text-rp-text-muted">
          <span>Start (HH:MM:SS)</span>
          <input
            aria-describedby="trim-feedback"
            aria-invalid={Boolean(error)}
            className={editorFieldClass}
            type="text"
            placeholder="00:00:00.000"
            spellCheck={false}
            value={draft.startText}
            onChange={(event) => onChange({ ...draft, startText: event.target.value })}
            onBlur={() => normalize("startText")}
          />
        </label>
        <label className="space-y-2 text-xs text-rp-text-muted">
          <span>End (HH:MM:SS)</span>
          <input
            aria-describedby="trim-feedback"
            aria-invalid={Boolean(error)}
            className={editorFieldClass}
            type="text"
            placeholder="00:00:00.000"
            spellCheck={false}
            value={draft.endText}
            onChange={(event) => onChange({ ...draft, endText: event.target.value })}
            onBlur={() => normalize("endText")}
          />
        </label>
      </div>
      <p
        id="trim-feedback"
        className={`text-xs leading-5 ${error ? "text-rp-danger" : "text-rp-text-muted"}`}
        aria-live="polite"
      >
        {error ||
          `${formatClipTime((end ?? 0) - (start ?? 0))} selected · ${formatClipTime(duration)} source`}
      </p>
      <p className="text-xs leading-5 text-rp-text-muted">
        Try 15–60 seconds for a focused social clip. You can use any part of your source.
      </p>
    </fieldset>
  );
}
