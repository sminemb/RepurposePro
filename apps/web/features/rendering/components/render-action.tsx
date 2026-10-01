"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClipEditor } from "@repurposepro/shared";
import { startClipRender } from "../client/render-api";

export function RenderAction({
  apiUrl,
  projectId,
  dirty,
  disabled,
  prepare,
}: {
  apiUrl: string;
  projectId: string;
  dirty: boolean;
  disabled: boolean;
  prepare: () => Promise<ClipEditor | null>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const busyRef = useRef(false);
  const render = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await prepare();
      if (!saved) {
        setError("Save or review your current edits before rendering.");
        return;
      }
      const revision = saved.clip.revision ?? 0,
        signature = `${saved.clip.id}:${revision}`;
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, key: crypto.randomUUID() };
      await startClipRender(
        apiUrl,
        projectId,
        { type: "clips", clipIds: [saved.clip.id], expectedRevision: revision },
        attempt.current.key,
      );
      router.push(`/projects/${encodeURIComponent(projectId)}/outputs`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Render unavailable. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="Export this clip"
      className="my-5 rounded-rp-md border border-rp-border bg-rp-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-rp-text-muted">
          Export this clip as a vertical MP4. No extra credits.
        </p>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void render()}
          className="min-h-11 rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Starting render…" : dirty ? "Save and render" : "Render clip"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rp-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
