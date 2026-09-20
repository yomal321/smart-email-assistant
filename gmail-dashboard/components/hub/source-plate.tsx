// Colour plus a two-letter code, never colour alone (DESIGN.md's one rule
// still worth keeping — see 0017_source_code.sql). Replaces the bare 8px dot
// that made every source read as "the same indigo dot" once 0016 backfilled
// every pre-existing task onto Work.
import type { Source } from "@/lib/data/types";

// Perceptual luminance (WCAG relative-luminance formula), not a straight RGB
// average — a mid-saturation amber and a mid-saturation violet can have the
// same average channel value and very different apparent brightness, and the
// wrong one flips to unreadable text.
function readableInkFor(hexColor: string): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? "#14152a" : "#ffffff";
}

export function SourcePlate({ source, size = "sm" }: { source: Source; size?: "sm" | "md" }) {
  return (
    <span
      className={`tabular inline-flex shrink-0 items-center justify-center rounded-pill font-narrow font-bold uppercase tracking-wider ${
        size === "sm" ? "h-4 min-w-[1.5rem] px-1 text-[9px]" : "h-5 min-w-[1.75rem] px-1.5 text-[10px]"
      }`}
      style={{ background: source.color, color: readableInkFor(source.color) }}
      title={source.name}
    >
      {source.code}
    </span>
  );
}
