export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a duration in milliseconds as a short human-readable string
 * (e.g. "45m", "3h 20m", "2d 4h"). Returns "—" for a negative or
 * non-finite input — callers computing an average from possibly-empty
 * data should check for `null` themselves before calling this rather
 * than relying on this placeholder.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";

  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * A sender's avatar color is picked deterministically from their name (same
 * sender, same color, every render) rather than reused from category/status
 * tokens — those two already carry their own meaning (what an email *is*),
 * and reusing them here would make an unrelated visual (who it's *from*)
 * look like a third status signal. Pulls from the same five-color set the
 * rest of the app already defines (`--cat-*`), so no new palette is
 * introduced and every pairing is already contrast-checked in both themes.
 */
const AVATAR_PALETTE = [
  { bg: "bg-cat-needs-reply-bg", fg: "text-cat-needs-reply-fg" },
  { bg: "bg-cat-fyi-bg", fg: "text-cat-fyi-fg" },
  { bg: "bg-cat-waiting-bg", fg: "text-cat-waiting-fg" },
  { bg: "bg-cat-promotional-bg", fg: "text-cat-promotional-fg" },
  { bg: "bg-cat-low-priority-bg", fg: "text-cat-low-priority-fg" },
] as const;

export function avatarPalette(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
