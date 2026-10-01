import { clipEditInputSchema, type ClipEditInput } from "@repurposepro/shared";

export type EditorDraft = Omit<ClipEditInput, "startTime" | "endTime"> & {
  startText: string;
  endText: string;
};
export function editorDraft(input: ClipEditInput): EditorDraft {
  const { startTime, endTime, ...rest } = input;
  return { ...rest, startText: String(startTime), endText: String(endTime) };
}
export function trimValidation(draft: EditorDraft, sourceDuration: number): string {
  const start = Number(draft.startText);
  const end = Number(draft.endText);
  if (
    !draft.startText.trim() ||
    !draft.endText.trim() ||
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  )
    return "Enter a start and end time.";
  // Compare the persisted millisecond boundaries, avoiding floating-point subtraction errors.
  if (start < 0 || end <= start || Math.round(start * 1000) >= Math.round(end * 1000))
    return "Start and end must differ at millisecond precision.";
  if (end > sourceDuration) return "Keep the trim within the source video.";
  return "";
}
export function draftInput(draft: EditorDraft): ClipEditInput | null {
  const { startText, endText, ...rest } = draft;
  if (!startText.trim() || !endText.trim()) return null;
  const parsed = clipEditInputSchema.safeParse({
    ...rest,
    startTime: Number(startText),
    endTime: Number(endText),
  });
  return parsed.success ? parsed.data : null;
}
export function rebaseSavedDraft(
  latest: EditorDraft,
  submitted: EditorDraft,
  saved: ClipEditInput,
): EditorDraft {
  return JSON.stringify(latest) === JSON.stringify(submitted)
    ? editorDraft(saved)
    : { ...latest, expectedRevision: saved.expectedRevision };
}
export { captionHighlightParts } from "@repurposepro/shared";
