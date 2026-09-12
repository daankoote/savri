revoke all privileges on table public.app_audit_events
  from public, anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.app_audit_events
  to service_role;
