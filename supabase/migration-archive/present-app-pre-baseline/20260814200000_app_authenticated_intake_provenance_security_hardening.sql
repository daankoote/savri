-- ENVAL 09C1C-R5-R1-S1 authenticated-intake provenance security hardening.
--
-- The table is internal/server-only truth. Writes and promotion reads run
-- inside postgres-owned SECURITY DEFINER RPCs. Direct service-role access is
-- read-only for the current trusted account-first convergence verifier.

alter table public.app_signup_authenticated_intake_provenance
  enable row level security;

create policy deny_all
on public.app_signup_authenticated_intake_provenance
for all to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_signup_authenticated_intake_provenance
  from public, anon, authenticated, service_role;
grant select on table public.app_signup_authenticated_intake_provenance
  to service_role;

revoke all on function
  public.app_signup_authenticated_intake_provenance_immutable_guard()
  from public, anon, authenticated, service_role;
