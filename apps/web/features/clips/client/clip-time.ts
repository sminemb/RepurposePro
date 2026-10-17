/** Source-relative timestamps; integer milliseconds avoid rollover and subtraction drift. */
export function formatClipTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--:--.---";
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const wholeSeconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function parseClipTime(text: string): number | null {
  const match = /^(\d+):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(text.trim());
  if (!match) return null;
  const milliseconds =
    Number(match[1]) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1000 +
    Number((match[4] ?? "").padEnd(3, "0"));
  return Number.isSafeInteger(milliseconds) ? milliseconds / 1000 : null;
}

/** Only recovery accepts the previous seconds-only representation. */
export function recoverClipTime(text: string): string {
  return /^\d+(?:\.\d+)?$/.test(text.trim()) && Number.isFinite(Number(text))
    ? formatClipTime(Number(text))
    : text;
}
