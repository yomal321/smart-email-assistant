"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortKey = "priority" | "date" | "delay" | "sender";
export type PriorityFilter = "all" | "urgent" | "normal" | "low";

export interface FilterState {
  priority: PriorityFilter;
  hasActionItems: boolean;
  unanswered: boolean;
  sort: SortKey;
}

export function FilterBar({
  state,
  onChange,
  matchedCount,
  totalCount,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  matchedCount: number;
  totalCount: number;
}) {
  const activeChips: { key: keyof FilterState; label: string }[] = [];
  if (state.priority !== "all") activeChips.push({ key: "priority", label: `Priority: ${state.priority}` });
  if (state.hasActionItems) activeChips.push({ key: "hasActionItems", label: "Has action items" });
  if (state.unanswered) activeChips.push({ key: "unanswered", label: "Unanswered" });

  function clearChip(key: keyof FilterState) {
    if (key === "priority") onChange({ ...state, priority: "all" });
    if (key === "hasActionItems") onChange({ ...state, hasActionItems: false });
    if (key === "unanswered") onChange({ ...state, unanswered: false });
  }

  return (
    <div className="rule-b bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2">
        <Select value={state.priority} onValueChange={(v) => onChange({ ...state, priority: v as PriorityFilter })}>
          <SelectTrigger size="sm" className="h-7 w-auto rounded-lg text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <Checkbox
            checked={state.hasActionItems}
            onCheckedChange={(v) => onChange({ ...state, hasActionItems: !!v })}
            className="rounded-lg"
          />
          Has action items
        </label>

        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <Checkbox
            checked={state.unanswered}
            onCheckedChange={(v) => onChange({ ...state, unanswered: !!v })}
            className="rounded-lg"
          />
          Unanswered
        </label>

        <span className="tabular text-xs text-ink-tertiary">
          {matchedCount} of {totalCount}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink-tertiary">Sort</span>
          <Select value={state.sort} onValueChange={(v) => onChange({ ...state, sort: v as SortKey })}>
            <SelectTrigger size="sm" className="h-7 w-auto rounded-lg text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="delay">Delay</SelectItem>
              <SelectItem value="sender">Sender</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="secondary" className="h-7 rounded-lg text-xs">
            Save view
          </Button>
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
          {activeChips.map((c) => (
            <button
              key={c.key}
              onClick={() => clearChip(c.key)}
              className="flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] text-ink-secondary hover:bg-surface-sunk"
              style={{ borderColor: "var(--rule)" }}
            >
              {c.label}
              <X size={10} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
