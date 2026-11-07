-- Explicit Data API privileges. Older Supabase projects grant these by default;
-- newer ones do not, so we state them. RLS (0001) still restricts every row to its owner.
-- anon gets nothing: every screen requires a signed-in user.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
