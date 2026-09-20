// The mail module's shell. Everything under /mail — and nothing else — gets
// the Departure Board chrome and the five email data providers.
//
// Scoping them to this layout is what keeps the two rooms from mixing: the hub
// never mounts BoardProvider (and so never fetches 124 emails to render a
// summary card), and /login, which lives outside both shells, cannot mount a
// data provider at all.
import { BoardProvider } from "@/components/board/board-provider";
import { ActionItemsProvider } from "@/components/board/action-items-provider";
import { ContactsProvider } from "@/components/board/contacts-provider";
import { DraftsProvider } from "@/components/board/drafts-provider";
import { CommitmentsProvider } from "@/components/board/commitments-provider";
import { AppShell } from "@/components/board/app-shell";

export default function MailLayout({ children }: { children: React.ReactNode }) {
  return (
    <BoardProvider>
      <ActionItemsProvider>
        <ContactsProvider>
          <DraftsProvider>
            <CommitmentsProvider>
              <AppShell>{children}</AppShell>
            </CommitmentsProvider>
          </DraftsProvider>
        </ContactsProvider>
      </ActionItemsProvider>
    </BoardProvider>
  );
}
