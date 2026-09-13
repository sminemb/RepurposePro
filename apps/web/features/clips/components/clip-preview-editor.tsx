"use client";

import {
  clipEditorInput,
  projectCaptionLines,
  type ClipEditor,
  type ClipPreviewCandidate,
} from "@repurposepro/shared";
import { useEffect, useMemo, useState } from "react";

import { requestClipEditor } from "../client/clip-editor-api";
import { useClipEditor } from "../client/use-clip-editor";
import { useEditorNavigation } from "../client/use-editor-navigation";
import { CaptionEditor } from "./caption-editor";
import { ClipPreviewPlayer } from "./clip-preview-player";
import { EditorLeaveDialog } from "./editor-leave-dialog";
import { TrimControls } from "./trim-controls";

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
    return <p className="text-rp-text-muted">No preview candidates are available yet.</p>;
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
      initial={loaded}
      onSelect={setActiveId}
      onSaved={(editor) =>
        setClips((items) => items.map((clip) => (clip.id === editor.clip.id ? editor.clip : clip)))
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
}) {
  const state = useClipEditor(initial, props.apiUrl, props.projectId, props.userId, onSaved);
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
              disabled={!state.dirty || state.saving}
              className="min-h-11 rounded-rp-md border border-rp-border px-4 text-sm text-rp-text disabled:opacity-40"
              onClick={state.discard}
            >
              Discard
            </button>
            <button
              type="button"
              disabled={!state.dirty || state.saving || Boolean(state.validation)}
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
              ))}
            </div>
          </section>
          <div className="min-w-0 md:order-1 xl:order-2">
            <ClipPreviewPlayer
              clip={preview}
              apiUrl={props.apiUrl}
              projectId={props.projectId}
              onTimeChange={setTime}
            />
          </div>
          <aside
            aria-label="Clip settings"
            className={`hidden min-w-0 rounded-rp-lg border border-rp-border bg-rp-surface p-4 md:order-2 xl:order-3 xl:block ${panel === "settings" ? "md:block" : ""}`}
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
      </div>
    </div>
  );
}
