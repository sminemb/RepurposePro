"use client";
import { useEffect, useRef } from "react";
export function ClipDeleteDialog({
  open,
  title,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open) ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-clip-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="w-[calc(100%-2rem)] max-w-md rounded-rp-lg border border-rp-border bg-rp-surface p-6 text-rp-text backdrop:bg-black/70"
    >
      <h2 id="delete-clip-title" className="text-lg font-semibold">
        Delete this clip?
      </h2>
      <p className="mt-3 text-sm leading-6 text-rp-text-muted">
        Remove “{title}” from your previews? Your source video and existing downloads stay
        available.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rp-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-11 rounded-rp-md border border-rp-border px-4"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="min-h-11 rounded-rp-md bg-rp-danger px-4 text-white"
        >
          {busy ? "Deleting…" : "Delete clip"}
        </button>
      </div>
    </dialog>
  );
}
