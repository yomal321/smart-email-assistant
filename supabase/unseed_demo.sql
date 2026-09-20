-- Undoes supabase/seed_demo.sql exactly, by the reserved 'dddddddd-…' id
-- prefix. FK-safe order: tasks (references courses/sources) before courses.
-- Sources are left alone — seed_demo.sql renames the 0016 placeholders in
-- place rather than inserting new rows, so there is nothing with a
-- 'dddddddd-…' id to remove there. Real data (the seven Gmail-extracted
-- tasks, any plans/notes) is untouched: none of it can carry this prefix.

begin;

delete from tasks   where id::text like 'dddddddd-%';
delete from courses where id::text like 'dddddddd-%';

commit;
