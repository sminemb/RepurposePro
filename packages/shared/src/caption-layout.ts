import type { CaptionPosition } from "./clips";

export const CAPTION_FONT = "RP Caption";
export const CAPTION_PADDING_X = 36;
export const CAPTION_PADDING_Y = 24;
export const CAPTION_RADIUS = 18;
// Inter 4.1 hhea ascent/descent / unitsPerEm. libass font size uses the full metric height.
export const CAPTION_ASS_FONT_SCALE = (1984 + 494) / 2048;
export function captionHighlightParts(
  text: string,
  highlights: readonly string[],
  colors: Readonly<Record<string, string>> = {},
): Array<{ text: string; highlighted: boolean; color?: string }> {
  const words = [...new Set(highlights.map((word) => word.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (!words.length) return [{ text, highlighted: false }];
  const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|");
  const expression = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, "giu");
  const parts: Array<{ text: string; highlighted: boolean; color?: string }> = [];
  let cursor = 0;
  for (const match of text.matchAll(expression)) {
    if (match.index > cursor)
      parts.push({ text: text.slice(cursor, match.index), highlighted: false });
    const key = match[0].toLowerCase();
    const color = Object.hasOwn(colors, key) ? colors[key] : undefined;
    parts.push({ text: match[0], highlighted: true, ...(color ? { color } : {}) });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlighted: false });
  return parts;
}

export function captionLayout(
  text: string,
  position: CaptionPosition,
  fontSize: number,
  measure: (text: string) => number,
) {
  const normalized = text.replace(/\s+/gu, " ").trim().toUpperCase();
  const maximum = 1080 * 0.88 - CAPTION_PADDING_X * 2;
  const lines: string[] = [];
  const lineStarts: number[] = [];
  let remaining = normalized;
  while (remaining) {
    const characters = Array.from(remaining);
    let count = 0;
    while (count < characters.length && measure(characters.slice(0, count + 1).join("")) <= maximum)
      count++;
    count = Math.max(1, count);
    let end = characters.slice(0, count).join("").length;
    if (count < characters.length) {
      const space = remaining.lastIndexOf(" ", end);
      if (space > 0) end = space;
    }
    lineStarts.push(normalized.length - remaining.length);
    lines.push(remaining.slice(0, end).trimEnd());
    remaining = remaining.slice(end).trimStart();
  }
  const lineHeight = fontSize * 1.25;
  const width = Math.min(1080 * 0.88, Math.max(0, ...lines.map(measure)) + CAPTION_PADDING_X * 2);
  const height = lines.length * lineHeight + CAPTION_PADDING_Y * 2;
  return {
    normalized,
    lineStarts,
    lines,
    lineHeight,
    width,
    height,
    centerX: position.x * 1080,
    centerY: position.y * 1920,
  };
}

/** Match phrases before wrapping so highlights crossing a line break keep their color. */
export function captionLayoutParts(
  layout: ReturnType<typeof captionLayout>,
  highlights: readonly string[],
  colors: Readonly<Record<string, string>> = {},
) {
  const normalizedColors = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(colors))
    normalizedColors[key.replace(/\s+/gu, " ").trim().toUpperCase().toLowerCase()] = value;
  const parts = captionHighlightParts(
    layout.normalized,
    highlights.map((value) => value.replace(/\s+/gu, " ").trim().toUpperCase()),
    normalizedColors,
  );
  return layout.lines.map((line, index) => {
    const start = layout.lineStarts[index]!,
      end = start + line.length;
    let cursor = 0;
    return parts.flatMap((part) => {
      const partStart = cursor;
      cursor += part.text.length;
      const text = part.text.slice(
        Math.max(0, start - partStart),
        Math.min(part.text.length, end - partStart),
      );
      return cursor > start && partStart < end && text ? [{ ...part, text }] : [];
    });
  });
}
