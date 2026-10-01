import {
  captionLayoutParts,
  captionLayout,
  CAPTION_RADIUS,
  CAPTION_ASS_FONT_SCALE,
  type ClipPreviewCandidate,
} from "@repurposepro/shared";

export function assColor(color: string): string {
  return `&H${color.slice(5, 7)}${color.slice(3, 5)}${color.slice(1, 3)}&`.toUpperCase();
}
export function escapeAss(text: string): string {
  return (
    text
      .replaceAll("{", "\\{")
      .replaceAll("}", "\\}")
      // A zero-width separator prevents literal \N, \n and \h becoming libass controls.
      .replace(/\\(?=[^{}])/g, "\\\uFEFF")
      .replace(/[\r\n]/g, " ")
  );
}
function assTime(seconds: number) {
  const value = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(value / 360000)}:${String(Math.floor(value / 6000) % 60).padStart(2, "0")}:${String(Math.floor(value / 100) % 60).padStart(2, "0")}.${String(value % 100).padStart(2, "0")}`;
}
function roundedBox(width: number, height: number) {
  const r = CAPTION_RADIUS,
    k = r * 0.55228475;
  return `m ${r} 0 l ${width - r} 0 b ${width - r + k} 0 ${width} ${r - k} ${width} ${r} l ${width} ${height - r} b ${width} ${height - r + k} ${width - r + k} ${height} ${width - r} ${height} l ${r} ${height} b ${r - k} ${height} 0 ${height - r + k} 0 ${height - r} l 0 ${r} b 0 ${r - k} ${r - k} 0 ${r} 0`;
}
export function generateAss(clip: ClipPreviewCandidate, measure: (text: string) => number): string {
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,Inter Black,${(clip.previewFontSize * CAPTION_ASS_FONT_SCALE).toFixed(4)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,8,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  if (!clip.captionsEnabled) return header;
  const events: string[] = [];
  for (const line of clip.captionLines) {
    const start = assTime(Math.max(clip.startTime, line.startTime) - clip.startTime);
    const end = assTime(Math.min(clip.endTime, line.endTime) - clip.startTime);
    if (start === end || line.endTime <= clip.startTime || line.startTime >= clip.endTime) continue;
    const layout = captionLayout(line.text, clip.captionPosition, clip.previewFontSize, measure);
    const left = layout.centerX - layout.width / 2,
      top = layout.centerY - layout.height / 2;
    const event = (layer: number, text: string) =>
      `Dialogue: ${layer},${start},${end},Caption,,0,0,0,,${text}`;
    events.push(
      event(
        0,
        `{\\an7\\pos(${left.toFixed(3)},${top.toFixed(3)})\\p1\\1c&H000000&\\1a&H33&}${roundedBox(layout.width, layout.height)}{\\p0}`,
      ),
    );
    captionLayoutParts(layout, line.highlights ?? [], line.highlightColors).forEach(
      (parts, index) => {
        const styled = parts
          .map(
            (part) =>
              `{\\1c${assColor(part.highlighted ? (part.color ?? "#c4522a") : (clip.captionTextColor ?? "#ffffff"))}}${escapeAss(part.text)}`,
          )
          .join("");
        events.push(
          event(
            1,
            `{\\an8\\pos(${layout.centerX.toFixed(3)},${(top + 24 + index * layout.lineHeight).toFixed(3)})}${styled}`,
          ),
        );
      },
    );
  }
  return header + events.join("\n") + "\n";
}
