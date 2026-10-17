"use client";

import type { ClipPreviewCandidate } from "@repurposepro/shared";

export interface ClipDeleteSelection {
  enabled: boolean;
  ids: readonly string[];
}
export function BulkClipSelection({
  clips,
  selection,
  onChange,
  disabled,
  onDelete,
}: {
  clips: readonly ClipPreviewCandidate[];
  selection: ClipDeleteSelection;
  onChange: (next: ClipDeleteSelection) => void;
  disabled: boolean;
  onDelete: () => void;
}) {
  const selected = clips.filter((clip) => selection.ids.includes(clip.id));
  return (
    <section
      aria-label="Bulk clip deletion"
      className="mb-4 rounded-rp-md border border-rp-border bg-rp-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={selection.enabled}
          onClick={() => onChange({ enabled: !selection.enabled, ids: [] })}
          className="min-h-11 rounded-rp-md border border-rp-border px-3 text-sm text-rp-text disabled:opacity-50"
        >
          {selection.enabled ? "Done selecting" : "Select clips"}
        </button>
        {selection.enabled ? (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ enabled: true, ids: clips.map((clip) => clip.id) })}
              className="min-h-11 px-2 text-sm font-semibold text-rp-primary disabled:opacity-50"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={disabled || !selected.length}
              onClick={() => onChange({ enabled: true, ids: [] })}
              className="min-h-11 px-2 text-sm text-rp-text-muted disabled:opacity-50"
            >
              Clear selection
            </button>
            <button
              type="button"
              disabled={disabled || !selected.length}
              onClick={onDelete}
              className="min-h-11 rounded-rp-md border border-rp-danger/50 px-3 text-sm text-rp-danger disabled:opacity-50"
            >
              Delete selected ({selected.length})
            </button>
          </>
        ) : null}
      </div>
      {selection.enabled ? (
        <>
          <p role="status" className="mt-2 text-sm text-rp-text-muted">
            {selected.length} of {clips.length} selected for deletion. Export selection stays the
            same.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {clips.map((clip) => (
              <label
                key={clip.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-rp-md border border-rp-border px-3 py-2 text-sm text-rp-text"
              >
                <input
                  type="checkbox"
                  checked={selection.ids.includes(clip.id)}
                  disabled={disabled}
                  aria-label={`Select ${clip.title} for deletion`}
                  className="size-4 shrink-0 accent-rp-danger"
                  onChange={(event) =>
                    onChange({
                      enabled: true,
                      ids: event.target.checked
                        ? [...selection.ids, clip.id]
                        : selection.ids.filter((id) => id !== clip.id),
                    })
                  }
                />
                <span>{clip.title}</span>
              </label>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
