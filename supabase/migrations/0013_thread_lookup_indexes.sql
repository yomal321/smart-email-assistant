-- GET /api/messages was measured at 65.7s for 119 rows -- lib/data/message-mapping.ts's
-- thread-sibling lookup (`emails` filtered by `thread_id`) and thread-entries lookup
-- (`thread_entries` filtered by `email_id`) ran once per row and, with no index backing
-- either column, each was a sequential scan. `tasks.email_id` and
-- `contacts(account_id, email)` already get an index for free from their `unique`
-- constraints (0003, 0006) -- these two never did, since Postgres does not auto-index
-- foreign keys. Bulk-batching the lookups themselves (in message-mapping.ts) cuts the
-- *number* of queries; these indexes make the ones that remain fast.

create index emails_thread_id_idx on emails (thread_id);
create index thread_entries_email_id_idx on thread_entries (email_id);
