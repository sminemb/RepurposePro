"use client";
import { useEffect, useState, useMemo } from "react";
import {
  captionLayout,
  captionLayoutParts,
  CAPTION_FONT,
  type CaptionLine,
  type CaptionPosition,
} from "@repurposepro/shared";

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
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void document.fonts.load(`900 64px "${CAPTION_FONT}"`).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const layout = useMemo(() => {
    if (!ready) return null;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return null;
    context.font = `900 ${fontSize}px "${CAPTION_FONT}"`;
    return captionLayout(line.text, position, fontSize, (text) => context.measureText(text).width);
  }, [ready, line.text, position, fontSize]);
  if (!layout) return null;
  const cqw = (px: number) => `${px / 10.8}cqw`;
  return (
    <div
      className="pointer-events-none absolute z-10 bg-black/80 text-center"
      style={{
        color: textColor,
        fontFamily: `"${CAPTION_FONT}"`,
        fontWeight: 900,
        fontSize: cqw(fontSize),
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: "translate(-50%, -50%)",
        width: cqw(layout.width),
        height: cqw(layout.height),
        borderRadius: cqw(18),
      }}
    >
      {captionLayoutParts(layout, line.highlights ?? [], line.highlightColors).map(
        (parts, index) => (
          <p
            key={index}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: cqw(24 + index * layout.lineHeight),
              lineHeight: cqw(layout.lineHeight),
              whiteSpace: "pre",
            }}
          >
            {parts.map((part, i) => (
              <span
                key={i}
                style={part.highlighted ? { color: part.color ?? "#c4522a" } : undefined}
              >
                {part.text}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
