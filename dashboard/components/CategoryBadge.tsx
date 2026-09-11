import type { EmailCategory } from "@/lib/types";

// Exported so chart components (VolumeChart/CategoryBreakdownChart, T12) can
// reuse the same category labels instead of redefining them — one source of
// truth for "what a category is called" across badges and charts.
export const CATEGORY_META: Record<EmailCategory, { label: string; bg: string; fg: string }> = {
  needs_reply: { label: "Needs reply", bg: "bg-cat-needs-reply-bg", fg: "text-cat-needs-reply-fg" },
  fyi: { label: "FYI", bg: "bg-cat-fyi-bg", fg: "text-cat-fyi-fg" },
  waiting_on_someone_else: { label: "Waiting", bg: "bg-cat-waiting-bg", fg: "text-cat-waiting-fg" },
  promotional: { label: "Promo", bg: "bg-cat-promotional-bg", fg: "text-cat-promotional-fg" },
  low_priority: { label: "Low priority", bg: "bg-cat-low-priority-bg", fg: "text-cat-low-priority-fg" },
};

export function CategoryBadge({ category }: { category: EmailCategory | null }) {
  if (!category) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Untriaged
      </span>
    );
  }
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.bg} ${meta.fg}`}
    >
      {meta.label}
    </span>
  );
}
