"use client";

import { clipEditorInput, validateClipEdit, type ClipEditor } from "@repurposepro/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { requestClipEditor } from "./clip-editor-api";
import { draftInput, editorDraft, rebaseSavedDraft, type EditorDraft } from "./clip-editor-state";

export function useClipEditor(
  initial: ClipEditor,
  apiUrl: string,
  projectId: string,
  userId: string,
  onSaved: (editor: ClipEditor) => void,
) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => editorDraft(clipEditorInput(initial)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<EditorDraft | null>(null);
  const [checkedRecovery, setCheckedRecovery] = useState(false);
  const draftRef = useRef(draft);
  const savingRef = useRef(false);
  const storageKey = `rp:clip-draft:${userId}:${projectId}:${initial.clip.id}`;
  const input = draftInput(draft);
  const start = Number(draft.startText),
    end = Number(draft.endText);
  const trimError =
    !draft.startText.trim() ||
    !draft.endText.trim() ||
    !Number.isFinite(start) ||
    !Number.isFinite(end)
      ? "Enter a start and end time."
      : start < 0 || end - start < 0.001
        ? "End time must be at least 0.001 seconds after start time."
        : end > saved.sourceDurationSeconds
          ? "Keep the trim within the source video."
          : "";
  const contractError = input
    ? validateClipEdit(input, saved.baseline, saved.sourceDurationSeconds)
    : null;
  const validation =
    trimError ||
    (!input || contractError
      ? "Caption text must contain 1–160 characters, with up to 10 highlights per phrase."
      : "");
  const dirty = JSON.stringify(draft) !== JSON.stringify(editorDraft(clipEditorInput(saved)));
  const update = useCallback((next: EditorDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);
  const clearRecovery = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Storage can be disabled. */
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      const value = sessionStorage.getItem(storageKey);
      if (value) {
        const recovered = JSON.parse(value) as EditorDraft;
        // Validate a copy with harmless placeholders, preserving unfinished input for recovery.
        if (
          typeof recovered.startText === "string" &&
          typeof recovered.endText === "string" &&
          draftInput({ ...recovered, startText: "0", endText: "1", captionEdits: [] }) &&
          Array.isArray(recovered.captionEdits) &&
          recovered.captionEdits.length <= 2000 &&
          recovered.captionEdits.every(
            (edit) =>
              typeof edit.text === "string" &&
              edit.text.length <= 160 &&
              Array.isArray(edit.highlights) &&
              edit.highlights.length <= 10 &&
              edit.highlights.every(
                (word: unknown) => typeof word === "string" && word.length <= 64,
              ) &&
              initial.baseline.some((line) => line.id === edit.id),
          )
        ) {
          setRecovery(recovered);
        } else clearRecovery();
      }
    } catch {
      clearRecovery();
    }
    setCheckedRecovery(true);
  }, [storageKey, initial.baseline, clearRecovery]);

  useEffect(() => {
    if (!checkedRecovery || recovery) return;
    try {
      if (dirty) sessionStorage.setItem(storageKey, JSON.stringify(draft));
      else clearRecovery();
    } catch {
      /* beforeunload and in-app navigation guards still protect this draft. */
    }
  }, [draft, dirty, storageKey, checkedRecovery, recovery, clearRecovery]);

  const save = async (): Promise<boolean> => {
    if (savingRef.current) return false;
    const submitted = draftRef.current;
    const parsed = draftInput(submitted);
    if (!parsed || validateClipEdit(parsed, saved.baseline, saved.sourceDurationSeconds)) {
      setError("Correct the highlighted fields before saving.");
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await requestClipEditor(apiUrl, projectId, saved.clip.id, parsed);
      const latest = draftRef.current;
      const next = rebaseSavedDraft(latest, submitted, clipEditorInput(result));
      setSaved(result);
      update(next);
      onSaved(result);
      clearRecovery();
      return JSON.stringify(next) === JSON.stringify(editorDraft(clipEditorInput(result)));
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : "Saving failed. Your edits are still here.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const discard = () => {
    update(editorDraft(clipEditorInput(saved)));
    setError("");
    clearRecovery();
  };
  return {
    saved,
    draft,
    update,
    input,
    validation,
    trimError,
    dirty,
    saving,
    error,
    save,
    discard,
    recovery,
    restore: () => {
      if (recovery) update({ ...recovery, expectedRevision: saved.clip.revision ?? 0 });
      setRecovery(null);
    },
    dismissRecovery: () => {
      clearRecovery();
      setRecovery(null);
    },
    clearRecovery,
  };
}
