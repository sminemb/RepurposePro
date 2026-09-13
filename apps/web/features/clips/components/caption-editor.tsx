"use client";

import type { CaptionBaselineLine, CaptionEdit } from "@repurposepro/shared";
import { useState } from "react";

import type { EditorDraft } from "../client/clip-editor-state";
import { editorFieldClass } from "./trim-controls";

const positions = [
  { name: "Middle", y: 0.5 },
  { name: "Lower middle", y: 0.72 },
  { name: "Bottom safe", y: 0.84 },
];
const sizes = [
  { name: "Small", value: 32 },
  { name: "Medium", value: 48 },
  { name: "Large", value: 64 },
  { name: "Extra large", value: 80 },
];

export function CaptionEditor({
  draft,
  lines,
  currentTime,
  onChange,
}: {
  draft: EditorDraft;
  lines: readonly CaptionBaselineLine[];
  currentTime: number;
  onChange: (draft: EditorDraft) => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(lines.length / 20));
  const activePage = Math.min(page, pageCount - 1);
  const updateLine = (line: CaptionBaselineLine, patch: Partial<CaptionEdit>) => {
    const existing = draft.captionEdits.find((edit) => edit.id === line.id);
    const edit: CaptionEdit = {
      id: line.id,
      text: existing?.text ?? line.text,
      highlights: existing?.highlights ?? [...(line.highlights ?? [])],
      ...patch,
    };
    onChange({
      ...draft,
      captionEdits: [...draft.captionEdits.filter((item) => item.id !== line.id), edit].sort(
        (a, b) => a.id.localeCompare(b.id),
      ),
    });
  };
  return (
    <fieldset className="mt-5 min-w-0 space-y-4">
      <legend className="font-semibold text-rp-text">Captions</legend>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-rp-text">
        <span>Show captions</span>
        <input
          className="size-5 accent-rp-primary"
          type="checkbox"
          checked={draft.captionsEnabled}
          onChange={(event) => onChange({ ...draft, captionsEnabled: event.target.checked })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-2 text-xs text-rp-text-muted">
          <span>Position</span>
          <select
            className={editorFieldClass}
            value={
              draft.captionPosition.x === 0.5 &&
              positions.some((position) => position.y === draft.captionPosition.y)
                ? String(draft.captionPosition.y)
                : "custom"
            }
            onChange={(event) =>
              onChange({ ...draft, captionPosition: { x: 0.5, y: Number(event.target.value) } })
            }
          >
            <option value="custom" disabled>
              Saved position
            </option>
            {positions.map((position) => (
              <option key={position.name} value={position.y}>
                {position.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-xs text-rp-text-muted">
          <span>Text size</span>
          <select
            className={editorFieldClass}
            value={draft.previewFontSize}
            onChange={(event) =>
              onChange({ ...draft, previewFontSize: Number(event.target.value) })
            }
          >
            {!sizes.some((size) => size.value === draft.previewFontSize) ? (
              <option value={draft.previewFontSize}>Saved size</option>
            ) : null}
            {sizes.map((size) => (
              <option key={size.value} value={size.value}>
                {size.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs leading-5 text-rp-text-muted">
        Edit each phrase below. Add a few words to highlight in ember.
      </p>
      <div className="max-h-[30rem] space-y-4 overflow-y-auto pr-1">
        {lines.slice(activePage * 20, (activePage + 1) * 20).map((line) => {
          const edit = draft.captionEdits.find((item) => item.id === line.id);
          const active = currentTime >= line.startTime && currentTime < line.endTime;
          return (
            <div
              key={line.id}
              className={`border-l-2 pl-3 ${active ? "border-rp-primary" : "border-rp-border"}`}
            >
              <label className="block space-y-2 text-xs text-rp-text-muted">
                <span>
                  {line.startTime.toFixed(2)}–{line.endTime.toFixed(2)}s{active ? " · Playing" : ""}
                </span>
                <textarea
                  aria-label={`Caption at ${line.startTime.toFixed(2)} seconds`}
                  className={`${editorFieldClass} resize-y`}
                  rows={2}
                  maxLength={160}
                  value={edit?.text ?? line.text}
                  onChange={(event) => updateLine(line, { text: event.target.value })}
                />
              </label>
              <KeywordHighlightEditor
                key={line.id}
                words={edit?.highlights ?? [...(line.highlights ?? [])]}
                onChange={(highlights) => updateLine(line, { highlights })}
              />
            </div>
          );
        })}
        {!lines.length ? (
          <p className="text-sm text-rp-text-muted">No speech captions in this trim.</p>
        ) : null}
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-xs text-rp-text-muted">
          <button
            type="button"
            className="min-h-11 px-2 disabled:opacity-40"
            disabled={!activePage}
            onClick={() => setPage(activePage - 1)}
          >
            Previous phrases
          </button>
          <span>
            {activePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="min-h-11 px-2 disabled:opacity-40"
            disabled={activePage === pageCount - 1}
            onClick={() => setPage(activePage + 1)}
          >
            Next phrases
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

function KeywordHighlightEditor({
  words,
  onChange,
}: {
  words: readonly string[];
  onChange: (words: string[]) => void;
}) {
  const [word, setWord] = useState("");
  const add = () => {
    const value = word.trim();
    if (
      value &&
      words.length < 10 &&
      !words.some((item) => item.toLowerCase() === value.toLowerCase())
    ) {
      onChange([...words, value]);
      setWord("");
    }
  };
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1">
        {words.map((value, index) => (
          <button
            type="button"
            key={`${value}-${index}`}
            aria-label={`Remove highlight ${value}`}
            className="min-h-9 rounded-rp-sm border border-rp-primary/40 bg-rp-primary-soft px-2 text-xs text-rp-text"
            onClick={() => onChange(words.filter((_, i) => i !== index))}
          >
            {value} <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          aria-label="Word or phrase to highlight"
          placeholder="Highlight a word…"
          className={editorFieldClass}
          maxLength={64}
          value={word}
          onChange={(event) => setWord(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-rp-md border border-rp-border px-3 text-xs text-rp-text disabled:opacity-40"
          disabled={!word.trim() || words.length >= 10}
          onClick={add}
        >
          Add
        </button>
      </div>
    </div>
  );
}
