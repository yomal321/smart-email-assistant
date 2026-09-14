// The single source of truth for the app's keyboard vocabulary — used by
// the shortcut sheet (?) and by row-action tooltips, so the keyboard map
// is learnable from the UI itself. See design-spec.md §6.1.

export interface ShortcutGroup {
  group: string;
  shortcuts: { keys: string[]; description: string }[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    group: "Move",
    shortcuts: [
      { keys: ["J", "↓"], description: "Next row" },
      { keys: ["K", "↑"], description: "Previous row" },
      { keys: ["Enter"], description: "Open the board sheet" },
      { keys: ["Esc"], description: "Close sheet / clear selection" },
      { keys: ["⇧", "J"], description: "Extend selection down" },
      { keys: ["⇧", "K"], description: "Extend selection up" },
    ],
  },
  {
    group: "Act",
    shortcuts: [
      { keys: ["E"], description: "Archive" },
      { keys: ["R"], description: "Reply" },
      { keys: ["S"], description: "Snooze" },
      { keys: ["D"], description: "Mark done" },
      { keys: ["X"], description: "Toggle selection" },
      { keys: ["1", "–", "7"], description: "Reassign to platform" },
      { keys: ["!"], description: "Toggle VIP" },
      { keys: ["U"], description: "Undo last action" },
    ],
  },
  {
    group: "Go to",
    shortcuts: [
      { keys: ["G", "I"], description: "Inbox" },
      { keys: ["G", "A"], description: "Action items" },
      { keys: ["G", "D"], description: "Drafts" },
      { keys: ["G", "F"], description: "Follow-ups" },
      { keys: ["G", "O"], description: "Overview" },
    ],
  },
  {
    group: "Find",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Command palette" },
      { keys: ["/"], description: "Focus search" },
      { keys: ["?"], description: "This shortcut sheet" },
    ],
  },
];
