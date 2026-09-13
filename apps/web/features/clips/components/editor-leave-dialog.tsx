"use client";

import { useEffect, useRef } from "react";

export function EditorLeaveDialog({
  open,
  saving,
  error,
  onCancel,
  onDiscard,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      aria-labelledby="leave-editor-title"
      className="m-auto w-[min(90vw,28rem)] rounded-rp-lg border border-rp-border bg-rp-surface p-6 text-rp-text shadow-rp-card backdrop:bg-black/70"
    >
      <h2 id="leave-editor-title" className="text-xl font-semibold">
        Save your changes?
      </h2>
      <p className="mt-3 text-sm leading-6 text-rp-text-muted">
        You have unsaved edits to this clip. Save them before leaving, or discard them.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-rp-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          className="min-h-11 rounded-rp-md border border-rp-border px-4 text-sm"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="min-h-11 rounded-rp-md border border-rp-border px-4 text-sm disabled:opacity-50"
          disabled={saving}
          onClick={onDiscard}
          type="button"
        >
          Discard
        </button>
        <button
          className="min-h-11 rounded-rp-md bg-rp-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving}
          onClick={onSave}
          type="button"
        >
          {saving ? "Saving…" : "Save & leave"}
        </button>
      </div>
    </dialog>
  );
}
