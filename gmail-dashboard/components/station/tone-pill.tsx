import type { Tone } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Tone renders only when non-neutral — the restraint is the point. design-spec.md §2.1.6 */
export function TonePill({ tone, evidence }: { tone: Tone; evidence?: string | null }) {
  if (tone === "neutral") return null;

  const label = tone === "tense" ? "Tense" : "Warm";
  const hue = tone === "tense" ? "var(--signal)" : "var(--cleared)";
  const pill = (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold tracking-wide font-narrow"
      )}
      style={{
        background: tone === "tense" ? "var(--signal-field)" : "var(--cleared-field)",
        color: `color-mix(in oklab, ${hue} 75%, var(--ink))`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: hue }} aria-hidden="true" />
      {label}
    </span>
  );

  if (!evidence) return pill;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        <p className="text-xs">
          <span className="font-semibold">{label} — </span>
          {evidence}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
