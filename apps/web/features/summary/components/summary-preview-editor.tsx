"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  summaryTimeToSource,
  validateSummaryEdits,
  type SummaryState,
  type SummarySegment,
} from "@repurposepro/shared";
import { useSummaryEditor, type SummaryDraftSegment } from "../client/use-summary-editor";
import { useEditorNavigation } from "@/features/clips/client/use-editor-navigation";
import { EditorLeaveDialog } from "@/features/clips/components/editor-leave-dialog";
import { useSourceRetention } from "@/features/upload/client/use-source-retention";
import { SourceRetentionNotice } from "@/features/upload/components/source-retention-notice";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-rp-md border border-rp-border px-4 text-sm font-semibold text-rp-text disabled:opacity-50";
const primary = `${button} border-rp-primary bg-rp-primary text-white`;
const time = (value: number) =>
  Number.isFinite(value)
    ? `${Math.floor(value / 60)}:${(value % 60).toFixed(1).padStart(4, "0")}`
    : "—";
export function SummaryPreviewEditor({
  initial,
  apiUrl,
  projectId,
  userId,
}: {
  initial: SummaryState;
  apiUrl: string;
  projectId: string;
  userId: string;
}) {
  const state = useSummaryEditor(initial, apiUrl, projectId, userId);
  const retention = useSourceRetention(apiUrl, projectId);
  const navigation = useEditorNavigation(
    state.dirty,
    state.busy,
    state.save,
    state.discard,
    state.clearRecovery,
    userId,
  );
  const video = useRef<HTMLVideoElement>(null),
    playback = useRef<{
      segments: SummarySegment[];
      index: number;
      continuous: boolean;
      summaryOffset: number;
    } | null>(null);
  const [playing, setPlaying] = useState(false),
    [current, setCurrent] = useState(0),
    [mediaError, setMediaError] = useState("");
  const selected = state.segments.filter((s) => s.selected),
    total = selected.reduce((sum, s) => sum + s.endTime - s.startTime, 0);
  const stop = () => {
    video.current?.pause();
    playback.current = null;
    setPlaying(false);
  };
  useEffect(() => {
    if (!retention.available) {
      video.current?.pause();
      playback.current = null;
      setPlaying(false);
    }
  }, [retention.available]);
  useEffect(() => {
    let frame: number;
    const tick = () => {
      const element = video.current,
        p = playback.current;
      if (element && p && !element.paused) {
        let range = p.segments[p.index]!;
        if (element.currentTime >= range.endTime) {
          if (p.continuous && p.index + 1 < p.segments.length) {
            p.index++;
            range = p.segments[p.index]!;
            element.currentTime = range.startTime;
          } else {
            element.currentTime = range.endTime;
            element.pause();
            setPlaying(false);
            playback.current = null;
          }
        }
        const offset = p.segments
          .slice(0, p.index)
          .reduce((sum, s) => sum + s.endTime - s.startTime, 0);
        setCurrent(
          p.summaryOffset +
            offset +
            Math.max(
              0,
              Math.min(element.currentTime - range.startTime, range.endTime - range.startTime),
            ),
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const play = async (ranges: SummarySegment[], continuous: boolean) => {
    if (!retention.available) return;
    const element = video.current;
    if (!element || !ranges.length) return;
    setMediaError("");
    const duration = ranges.reduce((sum, s) => sum + s.endTime - s.startTime, 0);
    const position = continuous && current < duration ? Math.max(0, current) : 0;
    const sourceTime = summaryTimeToSource(ranges, position);
    const index = Math.max(
      0,
      ranges.findIndex((s) => sourceTime < s.endTime),
    );
    const segmentIndex = selected.findIndex((s) => s.id === ranges[0]!.id);
    const summaryOffset = continuous
      ? 0
      : selected
          .slice(0, Math.max(0, segmentIndex))
          .reduce((sum, s) => sum + s.endTime - s.startTime, 0);
    playback.current = { segments: ranges, index, continuous, summaryOffset };
    element.currentTime = sourceTime;
    try {
      await element.play();
      setPlaying(true);
    } catch {
      playback.current = null;
      setPlaying(false);
      setMediaError("Playback could not start. Try again after the source has loaded.");
    }
  };
  const change = (id: string, update: Partial<SummaryDraftSegment>) => {
    stop();
    setCurrent(0);
    state.update(state.draft.map((s) => (s.id === id ? { ...s, ...update } : s)));
  };
  const restore = (id: string) => {
    const next = state.segments.map((s) => (s.id === id ? { ...s, selected: true } : s));
    if (!validateSummaryEdits(next, state.saved.sourceDurationSeconds)) {
      setMediaError(
        "Trim this removed segment so it fits between its selected neighbors before restoring it.",
      );
      return;
    }
    setMediaError("");
    change(id, { selected: true });
  };
  return (
    <div className="space-y-6">
      <SourceRetentionNotice
        metadata={retention.metadata}
        available={retention.available}
        error={retention.error}
      />
      <div className="flex flex-wrap gap-4 text-sm">
        <Link className="text-rp-text-muted" href="/dashboard">
          ← Back to workspace
        </Link>
        <Link className="text-rp-primary" href={`/projects/${projectId}/outputs`}>
          View exports
        </Link>
      </div>
      <SummaryDurationBar
        current={total}
        target={state.saved.targetDurationSeconds}
        source={state.saved.sourceDurationSeconds}
      />
      {state.recovery ? (
        <section
          aria-label="Recovered draft"
          className="rounded-rp-md border border-rp-primary/40 bg-rp-surface p-4"
        >
          <p className="text-rp-text">
            An unsaved summary draft is available. Review restored edits against the latest saved
            version.
          </p>
          <div className="mt-3 flex gap-3">
            <button className={button} onClick={state.restore}>
              Restore draft
            </button>
            <button className={button} onClick={state.discard}>
              Discard draft
            </button>
          </div>
        </section>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,1fr)]">
        <section
          className="min-w-0 rounded-rp-lg border border-rp-border bg-rp-surface p-4 sm:p-6"
          aria-label="Summary preview"
        >
          <h2 className="text-lg font-semibold text-rp-text">Preview your summary</h2>
          <p className="mt-2 text-sm text-rp-text-muted">
            Original picture and audio, joined in source order. No captions or cropping.
          </p>
          <video
            ref={video}
            className="mt-5 max-h-[32rem] w-full rounded-rp-md bg-black"
            src={
              retention.available
                ? `${apiUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/source-video/content`
                : undefined
            }
            crossOrigin="use-credentials"
            preload="metadata"
            playsInline
            onError={() =>
              setMediaError(
                "The source video is unavailable or has expired. Saved edits and existing exports remain available.",
              )
            }
            onPause={() => setPlaying(false)}
            aria-label="Source video summary preview"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className={button}
              disabled={!retention.available || !state.valid || !selected.length || state.busy}
              onClick={() => void play(selected, true)}
            >
              Play summary
            </button>
            <button className={button} disabled={!playing} onClick={stop}>
              Pause
            </button>
          </div>
          <label className="mt-5 block text-sm text-rp-text-muted">
            Summary playback · {time(current)} / {time(total)}
            <input
              aria-label="Seek summary"
              type="range"
              min={0}
              max={Number.isFinite(total) ? total : 0}
              step={0.1}
              value={Math.min(current, Number.isFinite(total) ? total : 0)}
              disabled={!retention.available || !state.valid || !selected.length}
              className="mt-3 w-full accent-rp-primary"
              onChange={(event) => {
                const t = Number(event.target.value);
                stop();
                setCurrent(t);
                if (video.current)
                  video.current.currentTime = summaryTimeToSource(state.segments, t);
              }}
            />
          </label>
          <p className="mt-4 text-xs text-rp-text-muted lg:hidden">
            Use the ordered segment controls below to edit on this screen.
          </p>
        </section>
        <SummarySegmentList
          previewUnavailable={!retention.available}
          segments={state.segments}
          draft={state.draft}
          busy={state.busy}
          onChange={change}
          onRestore={restore}
          onPreview={(s) => {
            if (s.startTime >= 0 && s.endTime <= state.saved.sourceDurationSeconds)
              void play([s], false);
            else setMediaError("Choose preview times within the source video.");
          }}
        />
      </div>
      {!state.valid ? (
        <p role="alert" className="text-sm text-rp-danger">
          Enter source times in order, with end after start and no selected overlaps.
        </p>
      ) : null}
      {state.error || mediaError ? (
        <p role="alert" className="text-sm text-rp-danger">
          {state.error || mediaError}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-rp-text-muted">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-rp-border pt-5">
        <button
          className={button}
          disabled={!state.dirty || !state.valid || state.busy || !!state.recovery}
          onClick={() => void state.save()}
        >
          {state.busy ? "Working…" : "Save summary"}
        </button>
        <button
          className={button}
          disabled={!state.dirty || state.busy}
          onClick={() => {
            stop();
            state.discard();
          }}
        >
          Discard changes
        </button>
        <button
          className={button}
          disabled={state.busy}
          onClick={() => navigation.request(() => void state.reload())}
        >
          Reload saved version
        </button>
        <button
          className={primary}
          disabled={
            !retention.available ||
            !state.valid ||
            !selected.length ||
            state.busy ||
            !!state.recovery
          }
          onClick={() => {
            stop();
            void state.render().then((success) => {
              if (success)
                navigation.navigateSaved(() =>
                  location.assign(`/projects/${encodeURIComponent(projectId)}/outputs`),
                );
            });
          }}
        >
          Render Summary
        </button>
        <p className="text-sm text-rp-text-muted">
          Rendering is free.{" "}
          {state.dirty ? "Changes will be saved first." : "Saved edits will be rendered."}
        </p>
      </div>
      <EditorLeaveDialog
        subject="summary"
        open={!!navigation.pending}
        saving={state.busy}
        error={state.error}
        onCancel={navigation.cancel}
        onDiscard={navigation.discardAndLeave}
        onSave={() => void navigation.saveAndLeave()}
      />
    </div>
  );
}
export function SummaryDurationBar({
  current,
  target,
  source,
}: {
  current: number;
  target: number;
  source: number;
}) {
  return (
    <section
      className="rounded-rp-lg border border-rp-border bg-rp-surface p-5"
      aria-label="Summary duration"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <p className="font-semibold text-rp-text">
          Summary: {time(current)}{" "}
          <span className="font-normal text-rp-text-muted">/ Target: {time(target)}</span>
        </p>
        <p className="text-sm text-rp-text-muted">Source: {time(source)}</p>
      </div>
      <progress
        className="mt-4 h-2 w-full accent-rp-primary"
        max={Math.max(target, current || 0)}
        value={Number.isFinite(current) ? current : 0}
        aria-label="Current versus target duration"
      />
      <p className="mt-3 text-xs text-rp-text-muted">
        AI selections target 10% of the source. Your edits can change the length.
      </p>
    </section>
  );
}
export function SummarySegmentList({
  previewUnavailable = false,
  segments,
  draft,
  busy,
  onChange,
  onRestore,
  onPreview,
}: {
  segments: SummarySegment[];
  previewUnavailable?: boolean;
  draft: SummaryDraftSegment[];
  busy: boolean;
  onChange: (id: string, update: Partial<SummaryDraftSegment>) => void;
  onRestore: (id: string) => void;
  onPreview: (s: SummarySegment) => void;
}) {
  const cards = (items: SummarySegment[]) =>
    items.map((s) => (
      <SummarySegmentCard
        key={s.id}
        segment={s}
        draft={draft.find((d) => d.id === s.id)!}
        busy={busy}
        previewUnavailable={previewUnavailable}
        onChange={onChange}
        onRestore={onRestore}
        onPreview={onPreview}
      />
    ));
  return (
    <section className="min-w-0 space-y-4" aria-label="Chronological summary segments">
      <h2 className="text-lg font-semibold text-rp-text">
        Selected segments · {segments.filter((s) => s.selected).length}
      </h2>
      {segments.some((s) => s.selected) ? (
        cards(segments.filter((s) => s.selected))
      ) : (
        <p className="rounded-rp-md border border-rp-border p-5 text-rp-text-muted">
          No selected segments. Restore one below to preview or render.
        </p>
      )}
      {segments.some((s) => !s.selected) ? (
        <details className="rounded-rp-md border border-rp-border p-4">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold text-rp-text">
            Removed segments · {segments.filter((s) => !s.selected).length}
          </summary>
          <div className="mt-4 space-y-4">{cards(segments.filter((s) => !s.selected))}</div>
        </details>
      ) : null}
    </section>
  );
}
export function SummarySegmentCard({
  previewUnavailable = false,
  segment: s,
  draft,
  busy,
  onChange,
  onRestore,
  onPreview,
}: {
  segment: SummarySegment;
  previewUnavailable?: boolean;
  draft: SummaryDraftSegment;
  busy: boolean;
  onChange: (id: string, update: Partial<SummaryDraftSegment>) => void;
  onRestore: (id: string) => void;
  onPreview: (s: SummarySegment) => void;
}) {
  const field =
    "mt-2 min-h-11 w-full rounded-rp-md border border-rp-border bg-rp-bg px-3 text-rp-text";
  return (
    <article className="rounded-rp-lg border border-rp-border bg-rp-surface p-5">
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold text-rp-text">Segment {s.order + 1}</h3>
        <span className="text-sm text-rp-text-muted">{time(s.endTime - s.startTime)}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-rp-text-muted">{s.reason}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-sm text-rp-text-muted">
          Start (seconds)
          <input
            aria-label={`Segment ${s.order + 1} start`}
            className={field}
            type="number"
            step={0.001}
            min={0}
            value={draft.startText}
            disabled={busy}
            onChange={(e) => onChange(s.id, { startText: e.target.value })}
          />
        </label>
        <label className="text-sm text-rp-text-muted">
          End (seconds)
          <input
            aria-label={`Segment ${s.order + 1} end`}
            className={field}
            type="number"
            step={0.001}
            min={0}
            value={draft.endText}
            disabled={busy}
            onChange={(e) => onChange(s.id, { endText: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className={button}
          disabled={
            previewUnavailable ||
            busy ||
            !Number.isFinite(s.startTime) ||
            !(s.endTime > s.startTime)
          }
          onClick={() => onPreview(s)}
        >
          Preview segment
        </button>
        {s.selected ? (
          <button
            className={button}
            disabled={busy}
            onClick={() => onChange(s.id, { selected: false })}
          >
            Remove
          </button>
        ) : (
          <button className={button} disabled={busy} onClick={() => onRestore(s.id)}>
            Restore segment
          </button>
        )}
      </div>
    </article>
  );
}
