"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/app/delete-confirmation-dialog";
import { deleteProjectAction } from "../actions/delete-project";

export function ProjectDeleteButton({
  projectId,
  name,
  onDeleted,
}: {
  projectId: string;
  name: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await deleteProjectAction(projectId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onDeleted();
    } catch {
      setError("Could not delete this project. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        aria-label={`Delete project ${name}`}
        title="Delete project"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-rp-md text-rp-text-muted hover:bg-rp-danger-soft hover:text-rp-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-danger"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
      <DeleteConfirmationDialog
        open={open}
        heading="Delete this project?"
        description={
          <>
            Delete “{name}” and its uploaded video, previews, and generated files? This cannot be
            undone. Billing history stays available.
          </>
        }
        confirmLabel="Delete project"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
