import { platformMeta, type Platform } from "@/lib/data";
import { cn } from "@/lib/utils";

function confidenceEdge(confidence: number): { style: "solid" | "solid-faint" | "dashed"; label: string } {
  if (confidence >= 85) return { style: "solid", label: "confident" };
  if (confidence >= 70) return { style: "solid-faint", label: "probable" };
  return { style: "dashed", label: "uncertain" };
}

/**
 * The platform badge — a soft tinted pill carrying the platform number and
 * its two-letter code. Confidence is encoded in the badge's own edge (solid,
 * faint, or dashed), never as a colour alone. design-spec.md §5.3
 */
export function PlatformBadge({
  platform,
  confidence,
  className,
}: {
  platform: Platform;
  confidence: number;
  className?: string;
}) {
  const meta = platformMeta(platform);
  const edge = confidenceEdge(confidence);
  const hue = `var(--platform-${meta.number})`;
  return (
    <span
      className={cn(
        "inline-flex h-5.5 w-19 shrink-0 items-center gap-1 overflow-hidden rounded-full pr-2 pl-0.5 text-[10.5px] font-bold tracking-wide",
        "font-narrow",
        edge.style === "dashed" && "border border-dashed",
        edge.style === "solid" && "border",
        edge.style === "solid-faint" && "border border-transparent",
        className
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${hue} 15%, var(--surface-raised))`,
        color: `color-mix(in oklab, ${hue} 70%, var(--ink))`,
        borderColor: `color-mix(in oklab, ${hue} 45%, transparent)`,
      }}
      title={`Platform ${meta.number}, ${meta.label}, ${confidence}% confidence — ${edge.label}`}
      aria-label={`Platform ${meta.number}, ${meta.label}, ${confidence} percent confidence, ${edge.label}`}
    >
      <span
        className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full tabular"
        style={{ backgroundColor: hue, color: `var(--platform-${meta.number}-ink)` }}
      >
        {meta.number}
      </span>
      <span className="flex-1 text-center">{meta.code}</span>
    </span>
  );
}
