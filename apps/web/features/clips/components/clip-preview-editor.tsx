"use client";

import {
  clipEditorInput,
  projectCaptionLines,
  type ClipEditor,
  type ClipPreviewCandidate,
  projectClipListSchema,
} from "@repurposepro/shared";
import { useEffect, useMemo, useState, useRef } from "react";

import { requestClipEditor } from "../client/clip-editor-api";
import { useClipEditor } from "../client/use-clip-editor";
import { useEditorNavigation } from "../client/use-editor-navigation";
import { CaptionEditor } from "./caption-editor";
import { useFramingAnalysis } from "../client/use-framing-analysis";
import { FramingControls } from "./framing-controls";
import { ClipPreviewPlayer } from "./clip-preview-player";
import { EditorLeaveDialog } from "./editor-leave-dialog";
import { editorFieldClass, TrimControls } from "./trim-controls";
import { loadRenderJobStatus } from "@/features/rendering/client/job-status-api";
import { RenderAction } from "@/features/rendering/components/render-action";
import { selectClip, deleteClip, regenerateClip } from "../client/clip-management-api";
import { ClipDeleteDialog } from "./clip-delete-dialog";

interface Props {
  apiUrl: string;
  projectId: string;
  userId: string;
  clips: readonly ClipPreviewCandidate[];
}
export function ClipPreviewEditor(props: Props) {
  const [clips, setClips] = useState(props.clips);
  const [activeId, setActiveId] = useState(props.clips[0]?.id ?? "");
  const [loaded, setLoaded] = useState<ClipEditor | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [managementBusy, setManagementBusy] = useState("");
  const [managementError, setManagementError] = useState("");
  const onSelection = async (id: string, selected: boolean) => {
    if (managementBusy) return;
    setManagementBusy(id);
    setManagementError("");
    try {
      const next = await selectClip(props.apiUrl, props.projectId, id, selected);
      setClips((items) =>
        items.map((clip) => (clip.id === id ? { ...clip, selected: next.selected } : clip)),
      );
    } catch (failure) {
      setManagementError(
        failure instanceof Error ? failure.message : "Could not update selection.",
      );
    } finally {
      setManagementBusy("");
    }
  };
  const pendingJobs = JSON.stringify(
    clips
      .filter((clip) => clip.regenerationJobId)
      .map((clip) => ({ clipId: clip.id, jobId: clip.regenerationJobId! })),
  );
  useEffect(() => {
    const pending = JSON.parse(pendingJobs) as { clipId: string; jobId: string }[];
    if (!pending.length) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      for (const item of pending) {
        try {
          const job = await loadRenderJobStatus(props.apiUrl, item.jobId, abort.signal);
          if (abort.signal.aborted) return;
          if (job.status === "failed") {
            setManagementError(
              job.message || "Replacement failed. Your original clip is safe; try again.",
            );
            setClips((items) =>
              items.map((clip) =>
                clip.id === item.clipId ? { ...clip, regenerationJobId: null } : clip,
              ),
            );
          } else if (job.status === "completed" && job.replacementClipId) {
            const response = await fetch(
              `${props.apiUrl.replace(/\/$/u, "")}/projects/${props.projectId}/clips`,
              { credentials: "include", cache: "no-store", signal: abort.signal },
            );
            if (!response.ok)
              throw new Error("Replacement saved. Reconnecting to your updated clips…");
            const body = (await response.json()) as { data: unknown };
            const next = projectClipListSchema.parse(body.data).clips;
            if (abort.signal.aborted) return;
            setClips((items) =>
              next.map((clip) => {
                const current = items.find((old) => old.id === clip.id);
                return current ? { ...clip, selected: current.selected } : clip;
              }),
            );
            setActiveId((id) => (id === item.clipId ? job.replacementClipId! : id));
            setManagementError("");
          }
        } catch (failure) {
          if (!abort.signal.aborted)
            setManagementError(
              failure instanceof Error ? failure.message : "Reconnecting to replacement progress…",
            );
        }
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [pendingJobs, props.apiUrl, props.projectId]);
  useEffect(() => {
    if (!activeId) return;
    const abort = new AbortController();
    setLoaded(null);
    setError("");
    void requestClipEditor(props.apiUrl, props.projectId, activeId, undefined, abort.signal)
      .then((editor) => {
        if (!abort.signal.aborted) setLoaded(editor);
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Could not load the editor.");
      });
    return () => abort.abort();
  }, [props.apiUrl, props.projectId, activeId, retry]);
  if (!activeId)
    return (
      <p className="rounded-rp-lg border border-rp-border bg-rp-surface p-6 text-rp-text-muted">
        No clips remain in this preview. Your source and previous exports are still available.
      </p>
    );
  if (!loaded || loaded.clip.id !== activeId)
    return (
      <section
        aria-busy={!error}
        className="rounded-rp-lg border border-rp-border bg-rp-surface p-6"
      >
        {error ? (
          <>
            <p role="alert" className="text-rp-danger">
              {error}
            </p>
            <button
              type="button"
              className="mt-3 min-h-11 text-rp-text"
              onClick={() => setRetry(retry + 1)}
            >
              Try again
            </button>
          </>
        ) : (
          <p className="text-rp-text-muted">Loading your clip editor…</p>
        )}
      </section>
    );
  return (
    <EditorSession
      key={activeId}
      {...props}
      clips={clips}
      managementBusy={managementBusy}
      managementError={managementError}
      onSelection={onSelection}
      onRegenerationJob={(id, jobId) =>
        setClips((items) =>
          items.map((clip) => (clip.id === id ? { ...clip, regenerationJobId: jobId } : clip)),
        )
      }
      onDeleted={(id) => {
        const next = clips.filter((clip) => clip.id !== id);
        setClips(next);
        setActiveId(next[0]?.id ?? "");
      }}
      initial={loaded}
      onSelect={setActiveId}
      onReplaced={async (id, originalId) => {
        const response = await fetch(
          `${props.apiUrl.replace(/\/$/u, "")}/projects/${props.projectId}/clips`,
          { credentials: "include", cache: "no-store" },
        );
        if (!response.ok) throw new Error("Replacement saved. Reload to see your updated clips.");
        const body = (await response.json()) as { data: unknown };
        const next = projectClipListSchema.parse(body.data).clips;
        setClips((items) =>
          next.map((clip) => {
            const current = items.find((old) => old.id === clip.id);
            return current ? { ...clip, selected: current.selected } : clip;
          }),
        );
        setActiveId((active) => (active === originalId ? id : active));
      }}
      onSaved={(editor) =>
        setClips((items) =>
          items.map((clip) =>
            clip.id === editor.clip.id ? { ...editor.clip, selected: clip.selected } : clip,
          ),
        )
      }
    />
  );
}

function EditorSession({
  initial,
  onSelect,
  onSaved,
  ...props
}: Props & {
  initial: ClipEditor;
  onSelect: (id: string) => void;
  onSaved: (editor: ClipEditor) => void;
  onSelection: (id: string, selected: boolean) => Promise<void>;
  onDeleted: (id: string) => void;
  onReplaced: (id: string, originalId: string) => Promise<void>;
  onRegenerationJob: (id: string, jobId: string | null) => void;
  managementBusy: string;
  managementError: string;
}) {
  const state = useClipEditor(initial, props.apiUrl, props.projectId, props.userId, onSaved);
  const tracking = useFramingAnalysis(props.apiUrl, props.projectId);
  const navigation = useEditorNavigation(
    state.dirty,
    state.saving,
    state.save,
    state.discard,
    state.clearRecovery,
    props.userId,
  );
  const [time, setTime] = useState(initial.clip.startTime);
  const [panel, setPanel] = useState<"clips" | "settings">("settings");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const regenerationJob =
    props.clips.find((clip) => clip.id === initial.clip.id)?.regenerationJobId ?? "";
  const regenerationBusy = regenerating || Boolean(regenerationJob);
  useEffect(() => {
    if (!regenerationJob) regenerationKey.current = null;
  }, [regenerationJob]);
  const [regenerateError, setRegenerateError] = useState("");
  const regenerationKey = useRef<{ key: string; revision: number } | null>(null);
  const regenerate = async () => {
    if (regenerationBusy) return;
    setRegenerating(true);
    setRegenerateError("");
    const revision = state.getSaved().clip.revision ?? 0;
    if (regenerationKey.current?.revision !== revision)
      regenerationKey.current = { key: crypto.randomUUID(), revision };
    try {
      const result = await regenerateClip(
        props.apiUrl,
        props.projectId,
        initial.clip.id,
        revision,
        regenerationKey.current.key,
      );
      if (result.replacementClipId) {
        state.clearRecovery();
        await props.onReplaced(result.replacementClipId, initial.clip.id);
      } else if (result.source === "gemini_regeneration") {
        props.onRegenerationJob(initial.clip.id, result.jobId);
      }
    } catch (failure) {
      setRegenerateError(failure instanceof Error ? failure.message : "Could not regenerate clip.");
    } finally {
      setRegenerating(false);
    }
  };
  const selected = props.clips.find((clip) => clip.id === initial.clip.id)?.selected !== false;
  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteClip(
        props.apiUrl,
        props.projectId,
        initial.clip.id,
        state.getSaved().clip.revision ?? 0,
      );
      state.clearRecovery();
      props.onDeleted(initial.clip.id);
    } catch (failure) {
      setDeleteError(failure instanceof Error ? failure.message : "Could not delete clip.");
    } finally {
      setDeleting(false);
    }
  };
  const [validTrim, setValidTrim] = useState({
    startTime: initial.clip.startTime,
    endTime: initial.clip.endTime,
  });
  useEffect(() => {
    if (!state.trimError)
      setValidTrim({
        startTime: Number(state.draft.startText),
        endTime: Number(state.draft.endText),
      });
  }, [state.draft.startText, state.draft.endText, state.trimError]);
  const effective = {
    ...clipEditorInput(state.saved),
    ...validTrim,
    captionsEnabled: state.draft.captionsEnabled,
    captionPosition: state.draft.captionPosition,
    previewFontSize: state.draft.previewFontSize,
    captionEdits: state.draft.captionEdits,
    captionTextColor: state.draft.captionTextColor,
    framing: state.draft.framing,
  };
  const lines = useMemo(
    () =>
      projectCaptionLines(state.saved.baseline, {
        ...validTrim,
        captionEdits: state.draft.captionEdits,
      }),
    [state.saved.baseline, validTrim, state.draft.captionEdits],
  );
  const preview: ClipPreviewCandidate = { ...state.saved.clip, ...effective, captionLines: lines };
  return (
    <div>
      <div className="mb-5 rounded-rp-md border border-rp-border bg-rp-surface px-4 py-3 text-sm leading-6 text-rp-text-muted md:hidden">
        The clip editor works best on a larger screen. Your saved preview is available below.
      </div>
      {state.recovery ? (
        <div
          role="status"
          className="mb-5 rounded-rp-md border border-rp-warning/40 bg-rp-surface p-4 text-sm text-rp-text"
        >
          <p>
            There is an unsaved draft from this tab.{" "}
            {state.recovery.expectedRevision !== (state.saved.clip.revision ?? 0)
              ? "The saved clip has changed since then. Review restored edits before saving."
              : "Restore it to continue editing."}
          </p>
          <div className="mt-2 flex gap-4">
            <button
              type="button"
              className="min-h-11 font-semibold text-rp-primary"
              onClick={state.restore}
            >
              Restore draft
            </button>
            <button
              type="button"
              className="min-h-11 text-rp-text-muted"
              onClick={state.dismissRecovery}
            >
              Discard draft
            </button>
          </div>
        </div>
      ) : null}
      <div inert={Boolean(state.recovery)}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-rp-md border border-rp-border bg-rp-surface p-3">
          <p role="status" className="text-sm text-rp-text-muted">
            {props.clips.filter((clip) => clip.selected !== false).length} of {props.clips.length}{" "}
            clips selected
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={
                regenerationBusy || deleting || state.saving || Boolean(props.managementBusy)
              }
              onClick={() => navigation.request(() => void regenerate())}
              className="min-h-11 rounded-rp-md border border-rp-border px-3 text-sm text-rp-text"
            >
              {regenerationBusy ? "Finding a replacement…" : "Regenerate clip"}
            </button>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-rp-text">
              <input
                aria-label={`Select ${state.saved.clip.title} for export`}
                type="checkbox"
                checked={selected}
                disabled={Boolean(props.managementBusy) || deleting || regenerationBusy}
                onChange={(event) => void props.onSelection(initial.clip.id, event.target.checked)}
                className="size-4 accent-rp-primary"
              />
              Include in export
            </label>
            <button
              type="button"
              disabled={
                regenerationBusy || deleting || state.saving || Boolean(props.managementBusy)
              }
              onClick={() =>
                navigation.request(() => {
                  setDeleteError("");
                  setDeleteOpen(true);
                })
              }
              className="min-h-11 rounded-rp-md border border-rp-danger/50 px-3 text-sm text-rp-danger"
            >
              Delete clip
            </button>
          </div>
        </div>
        {props.managementError ? (
          <p role="alert" className="mb-4 text-sm text-rp-danger">
            {props.managementError}
          </p>
        ) : null}
        {regenerateError ? (
          <p role="alert" className="mb-4 text-sm text-rp-danger">
            {regenerateError}
          </p>
        ) : null}
        <RenderAction
          apiUrl={props.apiUrl}
          projectId={props.projectId}
          userId={props.userId}
          selectedIds={props.clips.filter((clip) => clip.selected !== false).map((clip) => clip.id)}
          dirty={state.dirty}
          disabled={
            !props.clips.some((clip) => clip.selected !== false) ||
            props.clips.some((clip) => Boolean(clip.regenerationJobId)) ||
            regenerationBusy ||
            state.saving ||
            deleting ||
            Boolean(state.validation) ||
            Boolean(state.recovery) ||
            (state.draft.framing?.mode === "follow" && tracking.busy)
          }
          prepare={state.prepareRender}
        />
        <label className="mb-5 block space-y-2 text-sm text-rp-text md:hidden">
          <span>Choose a clip ({props.clips.length})</span>
          <select
            className={editorFieldClass}
            value={initial.clip.id}
            onChange={(event) => {
              const clipId = event.target.value;
              if (clipId !== initial.clip.id) navigation.request(() => onSelect(clipId));
            }}
          >
            {props.clips.map((clip) => (
              <option key={clip.id} value={clip.id}>
                {clip.title}
              </option>
            ))}
          </select>
        </label>
        <div className="sticky top-16 z-30 mb-5 hidden items-center justify-between gap-4 border-b border-rp-border bg-rp-bg py-4 md:flex">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rp-primary">
              Edit preview
            </p>
            <h2 className="mt-1 text-lg font-semibold text-rp-text">{state.saved.clip.title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span role="status" aria-live="polite" className="text-xs text-rp-text-muted">
              {state.saving ? "Saving…" : state.dirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <button
              type="button"
              disabled={regenerationBusy || !state.dirty || state.saving}
              className="min-h-11 rounded-rp-md border border-rp-border px-4 text-sm text-rp-text disabled:opacity-40"
              onClick={state.discard}
            >
              Discard
            </button>
            <button
              type="button"
              disabled={
                regenerationBusy || !state.dirty || state.saving || Boolean(state.validation)
              }
              className="min-h-11 rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-white disabled:opacity-40"
              onClick={() => void state.save()}
            >
              {state.saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
        {state.error ? (
          <div className="mb-4">
            <p role="alert" className="text-sm text-rp-danger">
              {state.error}
            </p>
            <button
              type="button"
              className="mt-2 min-h-11 text-sm text-rp-text underline"
              onClick={() => location.reload()}
            >
              Reload saved version
            </button>
          </div>
        ) : null}
        <div className="mb-4 hidden gap-2 md:flex xl:hidden" aria-label="Editor panels">
          {(["clips", "settings"] as const).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={panel === name}
              className={`min-h-11 rounded-rp-md border px-4 text-sm capitalize ${panel === name ? "border-rp-primary text-rp-text" : "border-rp-border text-rp-text-muted"}`}
              onClick={() => setPanel(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(17rem,1fr)] xl:grid-cols-[minmax(10rem,0.65fr)_minmax(15rem,1fr)_minmax(18rem,1fr)]">
          <section
            aria-label="Choose a clip"
            className={`hidden min-w-0 md:order-2 xl:order-1 xl:block ${panel === "clips" ? "md:block" : ""}`}
          >
            <h2 className="mb-4 font-semibold text-rp-text">
              Your clips <span className="text-rp-text-muted">({props.clips.length})</span>
            </h2>
            <div className="space-y-2">
              {props.clips.map((clip) => (
                <div key={clip.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${clip.title} for export`}
                    checked={clip.selected !== false}
                    disabled={Boolean(props.managementBusy) || deleting || regenerationBusy}
                    onChange={(event) => void props.onSelection(clip.id, event.target.checked)}
                    className="size-4 shrink-0 accent-rp-primary"
                  />
                  <button
                    key={clip.id}
                    type="button"
                    aria-pressed={clip.id === initial.clip.id}
                    className={`w-full rounded-rp-md border px-3 py-4 text-left ${clip.id === initial.clip.id ? "border-rp-primary bg-rp-primary-soft/40" : "border-rp-border bg-rp-surface"}`}
                    onClick={() => {
                      if (clip.id !== initial.clip.id) navigation.request(() => onSelect(clip.id));
                    }}
                  >
                    <span className="block text-sm font-semibold text-rp-text">{clip.title}</span>
                    <span className="mt-1 block text-xs text-rp-text-muted">
                      {clip.startTime.toFixed(1)}–{clip.endTime.toFixed(1)}s
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </section>
          <div className="min-w-0 md:order-1 xl:order-2">
            <ClipPreviewPlayer
              clip={preview}
              apiUrl={props.apiUrl}
              projectId={props.projectId}
              onTimeChange={setTime}
              tracks={tracking.status.data}
              onFramingChange={(framing) => {
                if (!regenerationBusy) state.update({ ...state.draft, framing });
              }}
            />
          </div>
          <aside
            inert={regenerationBusy}
            aria-label="Clip settings"
            className={`hidden min-h-0 min-w-0 self-start overflow-y-auto rounded-rp-lg border border-rp-border bg-rp-surface p-4 [scrollbar-gutter:stable] md:sticky md:top-44 md:order-2 md:max-h-[max(12rem,calc(100dvh-12rem))] xl:order-3 xl:block ${panel === "settings" ? "md:block" : ""}`}
          >
            <TrimControls
              draft={state.draft}
              duration={state.saved.sourceDurationSeconds}
              error={state.trimError}
              onChange={state.update}
            />
            {state.validation && !state.trimError ? (
              <p role="alert" className="mt-3 text-xs text-rp-danger">
                {state.validation}
              </p>
            ) : null}
            <FramingControls
              value={state.draft.framing}
              status={tracking.status}
              busy={tracking.busy}
              error={tracking.error}
              onAnalyze={() => void tracking.start()}
              onChange={(framing) => state.update({ ...state.draft, framing })}
              range={validTrim}
            />
            <CaptionEditor
              draft={state.draft}
              lines={lines}
              currentTime={time}
              onChange={state.update}
            />
          </aside>
        </div>
        <EditorLeaveDialog
          open={Boolean(navigation.pending)}
          saving={state.saving}
          error={state.error || state.validation}
          onCancel={navigation.cancel}
          onDiscard={navigation.discardAndLeave}
          onSave={() => void navigation.saveAndLeave()}
        />
        <ClipDeleteDialog
          open={deleteOpen}
          title={state.saved.clip.title}
          busy={deleting}
          error={deleteError}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => void remove()}
        />
      </div>
    </div>
  );
}
