begin;

alter table public.dossier_chargers
  drop constraint if exists dossier_chargers_serial_unique;

drop index if exists public.dossier_chargers_serial_uniq;
drop index if exists public.dossier_chargers_serial_unique;
drop index if exists public.dossier_chargers_dossier_serial_unique;
drop index if exists public.dossier_chargers_unique_serial_per_dossier;

commit;
