-- 20260305_0001_rls_dossier_sessions.sql
-- Repo-first: reproduceerbare baseline voor dossier_sessions
-- Doel: Data API dicht, alleen service-role via Edge Functions.

alter table public.dossier_sessions enable row level security;

drop policy if exists "deny_all" on public.dossier_sessions;

create policy "deny_all"
on public.dossier_sessions
as permissive
for all
to anon, authenticated
using (false)
with check (false);