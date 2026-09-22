"use client";

// Weekly Review — spec.md §30: what got done, what got missed, what's
// coming, cross-module progress, closing with the four framing questions.
// Read-only, no LLM call — same zero-cost principle as the bot's slash
// commands. See PHASE-7-IMPLEMENTATION-PLAN.md Wave 5.

import * as React from "react";
import { ProgressBar } from "@/components/hub/primitives";
import type { ActionItem, Plan } from "@/lib/data/types";

interface WeeklyReview {
  completedThisWeek: ActionItem[];
  missed: ActionItem[];
  upcomingNextWeek: ActionItem[];
  plansProgress: Plan[];
  habitsWeek: { habitId: string; name: string; loggedCount: number }[];
}

export default function WeeklyReviewPage() {
  const [review, setReview] = React.useState<WeeklyReview | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/hub/weekly-review", { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => setReview(body as WeeklyReview))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="space-y-5 p-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Weekly Review</h1>
          <p className="text-sm text-ink-secondary">The last 7 days, and the 7 ahead.</p>
        </div>

        {loading && <p className="text-sm text-ink-secondary">Loading…</p>}

        {!loading && review && (
          <>
            <Section title={`Completed this week (${review.completedThisWeek.length})`}>
              {review.completedThisWeek.length === 0 ? (
                <Empty text="Nothing marked done in the last 7 days." />
              ) : (
                review.completedThisWeek.map((item) => <ItemRow key={item.id} item={item} />)
              )}
            </Section>

            <Section title={`Missed / overdue (${review.missed.length})`} accent={review.missed.length > 0 ? "danger" : undefined}>
              {review.missed.length === 0 ? (
                <Empty text="Nothing overdue right now." />
              ) : (
                review.missed.map((item) => <ItemRow key={item.id} item={item} />)
              )}
            </Section>

            <Section title={`Upcoming next week (${review.upcomingNextWeek.length})`}>
              {review.upcomingNextWeek.length === 0 ? (
                <Empty text="Nothing due in the next 7 days." />
              ) : (
                review.upcomingNextWeek.map((item) => <ItemRow key={item.id} item={item} />)
              )}
            </Section>

            <Section title="Goals in progress">
              {review.plansProgress.length === 0 ? (
                <Empty text="No active plans." />
              ) : (
                <div className="space-y-2">
                  {review.plansProgress.map((plan) => {
                    const pct = plan.taskCount > 0 ? Math.round((plan.doneCount / plan.taskCount) * 100) : 0;
                    return (
                      <div key={plan.id} className="flex items-center gap-3 py-1">
                        <p className="min-w-0 flex-1 truncate text-sm text-ink">{plan.title}</p>
                        <div className="w-32 shrink-0">
                          <ProgressBar pct={pct} tone="success" />
                        </div>
                        <span className="tabular w-16 shrink-0 text-right text-xs text-ink-tertiary">
                          {plan.doneCount}/{plan.taskCount}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {review.habitsWeek.length > 0 && (
              <Section title="Habits this week">
                <div className="space-y-1">
                  {review.habitsWeek.map((h) => (
                    <div key={h.habitId} className="flex items-center justify-between py-1">
                      <p className="text-sm text-ink">{h.name}</p>
                      <span className="tabular text-xs text-ink-tertiary">{h.loggedCount}/7 days</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <div className="card-surface space-y-2 p-4">
              <h2 className="text-sm font-semibold text-ink">For next week</h2>
              <p className="text-xs text-ink-secondary">What should I focus on next week? — see Upcoming next week above.</p>
              <p className="text-xs text-ink-secondary">What did I miss? — see Missed / overdue above.</p>
              <p className="text-xs text-ink-secondary">What needs rescheduling? — anything still in Missed / overdue.</p>
              <p className="text-xs text-ink-secondary">What is becoming overdue? — anything due within the Upcoming window.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent?: "danger"; children: React.ReactNode }) {
  return (
    <div className="card-surface p-4">
      <h2 className={`mb-2 text-sm font-semibold ${accent === "danger" ? "" : "text-ink"}`} style={accent === "danger" ? { color: "var(--signal)" } : undefined}>
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-sm text-ink-tertiary">{text}</p>;
}

function ItemRow({ item }: { item: ActionItem }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <p className="min-w-0 flex-1 truncate text-sm text-ink">{item.text}</p>
      {item.dueAt && <span className="tabular shrink-0 text-xs text-ink-tertiary">{new Date(item.dueAt).toLocaleDateString()}</span>}
    </div>
  );
}
