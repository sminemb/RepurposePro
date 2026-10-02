"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { summaryEditSchema, validateSummaryEdits, type SummaryState } from "@repurposepro/shared";
import { summaryRequest, renderSummary } from "./summary-api";
export interface SummaryDraftSegment {
  id: string;
  startText: string;
  endText: string;
  selected: boolean;
}
const draftOf = (state: SummaryState): SummaryDraftSegment[] =>
  state.segments.map((s) => ({
    id: s.id,
    startText: String(s.startTime),
    endText: String(s.endTime),
    selected: s.selected,
  }));
export function useSummaryEditor(
  initial: SummaryState,
  apiUrl: string,
  projectId: string,
  userId: string,
) {
  const [saved, setSaved] = useState(initial),
    [draft, setDraft] = useState(() => draftOf(initial)),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState<SummaryDraftSegment[] | null>(null),
    [checked, setChecked] = useState(false);
  const draftRef = useRef(draft),
    savedRef = useRef(saved),
    busyRef = useRef(false),
    renderAttempt = useRef<{ revision: number; key: string } | null>(null);
  const storageKey = `rp:summary-draft:${userId}:${projectId}:${initial.analysisJobId}`;
  const clearRecovery = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Storage may be unavailable. */
    }
  }, [storageKey]);
  const update = (next: SummaryDraftSegment[]) => {
    if (busyRef.current) return;
    draftRef.current = next;
    setDraft(next);
    setMessage("");
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(saved));
  const segments = saved.segments.map((s) => {
    const d = draft.find((d) => d.id === s.id)!;
    return {
      ...s,
      startTime: d.startText.trim() ? Number(d.startText) : NaN,
      endTime: d.endText.trim() ? Number(d.endText) : NaN,
      selected: d.selected,
    };
  });
  const valid = validateSummaryEdits(segments, saved.sourceDurationSeconds);
  useEffect(() => {
    try {
      const text = sessionStorage.getItem(storageKey);
      if (text) {
        const parsed = JSON.parse(text) as { segments: SummaryDraftSegment[] };
        if (
          Array.isArray(parsed.segments) &&
          parsed.segments.length === initial.segments.length &&
          new Set(parsed.segments.map((s) => s.id)).size === initial.segments.length &&
          parsed.segments.every(
            (s) =>
              initial.segments.some((x) => x.id === s.id) &&
              typeof s.startText === "string" &&
              s.startText.length <= 30 &&
              typeof s.endText === "string" &&
              s.endText.length <= 30 &&
              typeof s.selected === "boolean",
          )
        )
          setRecovery(parsed.segments);
        else clearRecovery();
      }
    } catch {
      clearRecovery();
    }
    setChecked(true);
  }, [storageKey, initial, clearRecovery]);
  useEffect(() => {
    if (!checked || recovery) return;
    try {
      if (dirty)
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ revision: saved.revision, segments: draft }),
        );
      else clearRecovery();
    } catch {
      /* Storage may be unavailable. */
    }
  }, [checked, recovery, dirty, storageKey, saved.revision, draft, clearRecovery]);
  const discard = () => {
    draftRef.current = draftOf(savedRef.current);
    setDraft(draftRef.current);
    setRecovery(null);
    clearRecovery();
    setError("");
  };
  const save = async (): Promise<boolean> => {
    if (busyRef.current || recovery) return false;
    const current = savedRef.current;
    const captured = draftRef.current;
    const edits = captured.map((s) => ({
      id: s.id,
      startTime: s.startText.trim() ? Number(s.startText) : NaN,
      endTime: s.endText.trim() ? Number(s.endText) : NaN,
      selected: s.selected,
    }));
    const input = summaryEditSchema.safeParse({
      expectedRevision: current.revision,
      segments: edits,
    });
    if (!input.success || !validateSummaryEdits(edits, current.sourceDurationSeconds)) {
      setError("Enter valid chronological ranges within the source, without selected overlaps.");
      return false;
    }
    if (JSON.stringify(captured) === JSON.stringify(draftOf(current))) return true;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await summaryRequest(apiUrl, projectId, input.data);
      savedRef.current = next;
      setSaved(next);
      draftRef.current = draftOf(next);
      setDraft(draftRef.current);
      clearRecovery();
      setMessage("Summary saved.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summary could not be saved.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const render = async () => {
    if (!(await save())) return false;
    if (recovery || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const rev = savedRef.current.revision;
      if (renderAttempt.current?.revision !== rev)
        renderAttempt.current = { revision: rev, key: crypto.randomUUID() };
      await renderSummary(apiUrl, projectId, rev, renderAttempt.current.key);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summary could not start rendering.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const reload = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const next = await summaryRequest(apiUrl, projectId);
      if (next.analysisJobId !== initial.analysisJobId) {
        location.reload();
        return;
      }
      savedRef.current = next;
      setSaved(next);
      draftRef.current = draftOf(next);
      setDraft(draftRef.current);
      setRecovery(null);
      clearRecovery();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reload failed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return {
    saved,
    draft,
    segments,
    update,
    dirty,
    valid,
    busy,
    error,
    message,
    save,
    discard,
    render,
    reload,
    recovery,
    clearRecovery,
    restore: () => {
      if (recovery) {
        update(recovery);
        setRecovery(null);
        setMessage("Draft restored. Review it against the current saved revision before saving.");
      }
    },
  };
}
