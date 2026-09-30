import type { CaptionLine, CaptionPosition } from "@repurposepro/shared";

import { captionHighlightParts } from "../client/clip-editor-state";

export function CaptionOverlay({
  line,
  position,
  fontSize,
  textColor = "#FFFFFF",
}: {
  line: CaptionLine;
  position: CaptionPosition;
  fontSize: number;
  textColor?: string;
}) {
  return (
    <p
      className="pointer-events-none absolute z-10 w-max max-w-[88%] rounded-md bg-black/80 px-3 py-2 text-center font-black uppercase leading-tight break-words text-white shadow-lg"
      style={{
        color: textColor,
        fontSize: `${fontSize / 10.8}cqw`,
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {captionHighlightParts(line.text, line.highlights ?? [], line.highlightColors).map(
        (part, index) => (
          <span
            key={index}
            style={part.highlighted ? { color: part.color ?? "#c4522a" } : undefined}
          >
            {part.text}
          </span>
        ),
      )}
    </p>
  );
}
