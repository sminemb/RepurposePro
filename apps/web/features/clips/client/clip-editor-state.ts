import { clipEditInputSchema, type ClipEditInput } from "@repurposepro/shared";
import { formatClipTime, parseClipTime } from "./clip-time";

export type EditorDraft = Omit<ClipEditInput, "startTime" | "endTime"> & {
  startText: string;
  endText: string;
};
export function editorDraft(input: ClipEditInput): EditorDraft {
  const { startTime, endTime, ...rest } = input;
  return { ...rest, startText: formatClipTime(startTime), endText: formatClipTime(endTime) };
}
export function trimValidation(draft: EditorDraft, sourceDuration: number): string {
  const start = parseClipTime(draft.startText);
  const end = parseClipTime(draft.endText);
  if (start === null || end === null)
    return "Enter start and end as HH:MM:SS, with up to three decimal places.";
  // Compare the persisted millisecond boundaries, avoiding floating-point subtraction errors.
  if (start < 0 || end <= start || Math.round(start * 1000) >= Math.round(end * 1000))
    return "Start and end must differ at millisecond precision.";
  if (end > sourceDuration) return "Keep the trim within the source video.";
  return "";
}
export function draftInput(draft: EditorDraft): ClipEditInput | null {
  const { startText, endText, ...rest } = draft;
  const startTime = parseClipTime(startText);
  const endTime = parseClipTime(endText);
  if (startTime === null || endTime === null) return null;
  const parsed = clipEditInputSchema.safeParse({
    ...rest,
    startTime,
    endTime,
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
