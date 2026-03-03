Cheatsheet_ SUPABASE_SQL


=====

Plak dit om eerst te zien wat je gaat slopen:

-- QUICK INSPECT: counts per table in public
select
  schemaname,
  relname as table_name,
  n_live_tup as approx_rows
from pg_stat_user_tables
where schemaname = 'public'
order by n_live_tup desc;

Run. Nu zie je welke tabellen groot zijn.



=====

!!!!! NIET MET USERDATA !!!!! Hard truncate: alle tabellen in public (behalve supabase_migrations)


do $$
declare
  r record;
begin
  -- Truncate all tables in public schema, except supabase migrations table if present
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename <> 'supabase_migrations'
  loop
    execute format('truncate table public.%I restart identity cascade;', r.tablename);
  end loop;
end $$;


======