import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Empty states teach the interface, not "nothing here." design-spec.md §7.2
 * Centred, ~44ch, no illustration, no emoji, icon no larger than 24px.
 */
export function EmptyState({
  icon: Icon,
  heading,
  body,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  heading: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full flex-1 items-center justify-center px-6 py-16">
      <div className="mx-auto flex max-w-[44ch] flex-col items-center gap-2 text-center">
        <Icon size={24} className="mb-1 text-ink-tertiary" />
        <h2 className="text-lg font-semibold text-ink">{heading}</h2>
        <p className="text-sm text-ink-secondary">{body}</p>
        {actionLabel && (actionHref || onAction) && (
          <Button asChild={!!actionHref} size="sm" className="mt-2 rounded-lg" onClick={onAction}>
            {actionHref ? <Link href={actionHref}>{actionLabel}</Link> : <span>{actionLabel}</span>}
          </Button>
        )}
      </div>
    </div>
  );
}
