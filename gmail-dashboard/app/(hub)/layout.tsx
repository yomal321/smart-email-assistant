// The hub's shell — the main dashboard and every life module inside it.
// A route group, so these pages live at / , /tasks, /plans, /notes, /bot
// while the mail module keeps its own shell under /mail.
//
// No email data providers here by design: the hub reads its numbers from
// /api/hub/summary in one call rather than mounting the mail module's state.
import { HubShell } from "@/components/hub/hub-shell";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return <HubShell>{children}</HubShell>;
}
