import type { EditorDraft } from "../client/clip-editor-state";

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
  const length = Number(draft.endText) - Number(draft.startText);
  return (
    <fieldset className="space-y-3 border-b border-rp-border pb-5">
      <legend className="mb-3 font-semibold text-rp-text">Trim clip</legend>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-2 text-xs text-rp-text-muted">
          <span>Start (seconds)</span>
          <input
            aria-describedby="trim-feedback"
            aria-invalid={Boolean(error)}
            className={editorFieldClass}
            type="number"
            min={0}
            max={duration}
            step="0.001"
            value={draft.startText}
            onChange={(event) => onChange({ ...draft, startText: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-xs text-rp-text-muted">
          <span>End (seconds)</span>
          <input
            aria-describedby="trim-feedback"
            aria-invalid={Boolean(error)}
            className={editorFieldClass}
            type="number"
            min={0}
            max={duration}
            step="0.001"
            value={draft.endText}
            onChange={(event) => onChange({ ...draft, endText: event.target.value })}
          />
        </label>
      </div>
      <p
        id="trim-feedback"
        className={`text-xs leading-5 ${error ? "text-rp-danger" : "text-rp-text-muted"}`}
        aria-live="polite"
      >
        {error || `${length.toFixed(3)}s selected · ${duration.toFixed(3)}s source`}
      </p>
      <p className="text-xs leading-5 text-rp-text-muted">
        Try 15–60 seconds for a focused social clip. You can use any part of your source.
      </p>
    </fieldset>
  );
}
