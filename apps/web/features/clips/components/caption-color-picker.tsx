"use client";

const swatches = [
  "#FFFFFF",
  "#c4522a",
  "#FFD600",
  "#22C55E",
  "#38BDF8",
  "#A78BFA",
  "#F472B6",
  "#000000",
];

export function CaptionColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-2 py-2">
      <legend className="text-xs text-rp-text-muted">{label}</legend>
      <div className="flex flex-wrap items-center gap-1">
        {swatches.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label}: ${color}`}
            aria-pressed={value.toLowerCase() === color.toLowerCase()}
            onClick={() => onChange(color)}
            className="grid size-9 place-items-center rounded border border-rp-border focus-visible:outline-2 focus-visible:outline-rp-primary"
          >
            <span
              className="size-5 rounded-full border border-white/30"
              style={{
                backgroundColor: color,
                outline:
                  value.toLowerCase() === color.toLowerCase()
                    ? "2px solid var(--rp-primary)"
                    : undefined,
                outlineOffset: 2,
              }}
            />
          </button>
        ))}
        <label className="flex min-h-11 items-center gap-2 text-xs text-rp-text-muted">
          Custom{" "}
          <input
            type="color"
            aria-label={`${label}: custom color`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 w-9 cursor-pointer bg-transparent"
          />
        </label>
      </div>
    </fieldset>
  );
}
