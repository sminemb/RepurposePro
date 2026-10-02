"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { projectClipListSchema, type ClipEditor } from "@repurposepro/shared";
import { startClipRender } from "../client/render-api";

export function RenderAction({
  apiUrl,
  projectId,
  dirty,
  disabled,
  prepare,
  selectedIds,
  userId,
}: {
  apiUrl: string;
  projectId: string;
  dirty: boolean;
  disabled: boolean;
  prepare: () => Promise<ClipEditor | null>;
  selectedIds?: readonly string[];
  userId?: string;
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
      const clipIds = selectedIds ? [...selectedIds] : [saved.clip.id];
      if (
        userId &&
        clipIds.some(
          (id) =>
            id !== saved.clip.id &&
            sessionStorage.getItem(`rp:clip-draft:${userId}:${projectId}:${id}`),
        )
      )
        throw new Error(
          "Another selected clip has an unsaved draft in this tab. Open it and save or discard that draft before exporting.",
        );
      let expectedRevisions: Record<string, number> = { [saved.clip.id]: saved.clip.revision ?? 0 };
      if (selectedIds) {
        const response = await fetch(
          `${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/clips`,
          { credentials: "include", cache: "no-store" },
        );
        if (!response.ok) throw new Error("Could not verify selected clips. Try again.");
        const body = (await response.json()) as { data: unknown };
        const clips = projectClipListSchema.parse(body.data).clips;
        expectedRevisions = {};
        for (const id of clipIds) {
          const clip = clips.find((item) => item.id === id && item.selected !== false);
          if (!clip || clip.regenerationJobId)
            throw new Error("A selected clip changed. Reload before exporting.");
          expectedRevisions[id] =
            id === saved.clip.id ? (saved.clip.revision ?? 0) : (clip.revision ?? 0);
        }
      }
      const signature = JSON.stringify(expectedRevisions);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, key: crypto.randomUUID() };
      await startClipRender(
        apiUrl,
        projectId,
        selectedIds
          ? { type: "clips", clipIds, expectedRevisions }
          : { type: "clips", clipIds: [saved.clip.id], expectedRevision: saved.clip.revision ?? 0 },
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
      aria-label={selectedIds ? "Export selected clips" : "Export this clip"}
      className="my-5 rounded-rp-md border border-rp-border bg-rp-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-rp-text-muted">
          {selectedIds
            ? "Export selected clips as vertical MP4s. No extra credits."
            : "Export this clip as a vertical MP4. No extra credits."}
        </p>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void render()}
          className="min-h-11 rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy
            ? "Starting render…"
            : selectedIds
              ? dirty
                ? "Save and Render Selected Clips"
                : "Render Selected Clips"
              : dirty
                ? "Save and render"
                : "Render clip"}
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
