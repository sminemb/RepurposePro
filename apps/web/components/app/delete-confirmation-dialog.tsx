"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function DeleteConfirmationDialog({
  open,
  heading,
  description,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  heading: string;
  description: ReactNode;
  confirmLabel: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open) ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-rp-lg border border-rp-border bg-rp-surface p-6 text-rp-text backdrop:bg-black/70"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {heading}
      </h2>
      <p id={`${id}-description`} className="mt-3 text-sm leading-6 text-rp-text-muted">
        {description}
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
          className="min-h-11 rounded-rp-md bg-rp-danger px-4 text-white disabled:opacity-50"
        >
          {busy ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
