import { cn } from "@/lib/utils";

/** Falls back to initials, never a generic glyph — design-spec.md §10 Contact type. */
export function InitialsAvatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-ink-secondary bg-surface-sunk border", className)}
      style={{ width: size, height: size, fontSize: size * 0.4, borderColor: "var(--rule)" }}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}
