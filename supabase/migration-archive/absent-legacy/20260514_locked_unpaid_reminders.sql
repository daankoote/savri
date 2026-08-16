-- ENVAL locked/unpaid reminder flow
-- Date: 2026-05-14
--
-- Purpose:
-- - Queue reminder emails for locked/in_review unpaid dossiers.
-- - Reminder days: 3, 7, 10.
-- - Idempotent per dossier_id + reminder_day.
-- - Permanent non-PII reminder proof survives runtime dossier deletion.
--
-- Boundaries:
-- - No dossier lifecycle mutation.
-- - No retention cleanup.
-- - No export/payment mutation.
-- - No reminder for exported/preserved dossiers.
-- - outbound_emails remains delivery queue only, not permanent proof.

create table if not exists public.locked_unpaid_reminder_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  request_id text not null,
  environment text not null default 'unknown',
  actor_ref text not null default 'system:locked-unpaid-reminder-worker',

  dossier_id uuid not null,
  reminder_day integer not null,
  locked_at timestamptz not null,
  due_at timestamptz not null,

  status text not null,
  outbound_email_id bigint null,

  message_type text not null,
  event_data jsonb not null default '{}'::jsonb,

  constraint locked_unpaid_reminder_events_day_chk
    check (reminder_day in (3, 7, 10)),

  constraint locked_unpaid_reminder_events_status_chk
    check (status in ('queued', 'skipped_no_email'))
);

create unique index if not exists locked_unpaid_reminder_events_dossier_day_uidx
  on public.locked_unpaid_reminder_events (dossier_id, reminder_day);

create index if not exists locked_unpaid_reminder_events_created_at_idx
  on public.locked_unpaid_reminder_events (created_at desc);

create index if not exists locked_unpaid_reminder_events_dossier_id_idx
  on public.locked_unpaid_reminder_events (dossier_id);

create or replace function public.set_locked_unpaid_reminder_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_locked_unpaid_reminder_events_updated_at
  on public.locked_unpaid_reminder_events;

create trigger trg_locked_unpaid_reminder_events_updated_at
before update on public.locked_unpaid_reminder_events
for each row
execute function public.set_locked_unpaid_reminder_events_updated_at();

alter table public.locked_unpaid_reminder_events enable row level security;

drop policy if exists deny_all on public.locked_unpaid_reminder_events;

create policy deny_all
on public.locked_unpaid_reminder_events
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.locked_unpaid_reminder_events from public;
revoke all on table public.locked_unpaid_reminder_events from anon;
revoke all on table public.locked_unpaid_reminder_events from authenticated;
revoke all on table public.locked_unpaid_reminder_events from service_role;

grant select, insert, update on table public.locked_unpaid_reminder_events to service_role;

comment on table public.locked_unpaid_reminder_events is
'Permanent non-PII proof ledger for locked/unpaid reminder queueing. No FK to dossiers because runtime dossiers may later be deleted.';

comment on column public.locked_unpaid_reminder_events.dossier_id is
'Historical dossier UUID reference only. No FK because runtime dossier may later be deleted.';

comment on column public.locked_unpaid_reminder_events.event_data is
'Non-PII structured reminder metadata only. No email/name/address/IP/UA.';

drop function if exists public.enval_queue_locked_unpaid_reminders(
  boolean,
  timestamptz,
  uuid,
  integer,
  integer[],
  text,
  text
);

create or replace function public.enval_queue_locked_unpaid_reminders(
  p_apply boolean default false,
  p_now timestamptz default now(),
  p_target_dossier_id uuid default null,
  p_limit integer default 50,
  p_reminder_days integer[] default array[3,7,10],
  p_request_id text default 'unknown',
  p_environment text default 'unknown'
)
returns table (
  dossier_id uuid,
  reminder_day integer,
  due_at timestamptz,
  locked_at timestamptz,
  dossier_status text,
  apply boolean,
  queued boolean,
  skipped_reason text,
  outbound_email_id bigint,
  reminder_event_id uuid,
  message_type text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_event_id uuid;
  v_outbound_email_id bigint;
  v_message_type text;
  v_subject text;
  v_body text;
  v_customer_name text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'REMINDER_CONFIG_INVALID: p_limit must be between 1 and 100';
  end if;

  if p_reminder_days is null
    or p_reminder_days <> array[3,7,10]::integer[]
  then
    raise exception 'REMINDER_CONFIG_INVALID: p_reminder_days must be exactly {3,7,10}';
  end if;

  for r in
    with latest_export as (
      select distinct on (de.dossier_id)
        de.dossier_id,
        de.id as export_id,
        de.export_status,
        de.payment_status,
        de.created_at
      from public.dossier_exports de
      where coalesce(de.export_status, '') <> 'voided'
      order by de.dossier_id, de.created_at desc
    ),
    base as (
      select
        d.id as dossier_id,
        d.customer_email,
        d.customer_first_name,
        d.customer_last_name,
        d.status::text as dossier_status,
        coalesce(d.locked_at, d.updated_at, d.created_at) as effective_locked_at,
        floor(extract(epoch from (p_now - coalesce(d.locked_at, d.updated_at, d.created_at))) / 86400)::integer as age_days
      from public.dossiers d
      left join latest_export le on le.dossier_id = d.id
      where (
          d.locked_at is not null
          or coalesce(d.status::text, '') in ('in_review', 'ready_for_booking')
        )
        and le.dossier_id is null
        and (p_target_dossier_id is null or d.id = p_target_dossier_id)
    ),
    due as (
      select
        b.*,
        case
          when b.age_days >= 10 then 10
          when b.age_days >= 7 then 7
          when b.age_days >= 3 then 3
          else null
        end as due_reminder_day
      from base b
    )
    select
      d.*
    from due d
    where d.due_reminder_day is not null
      and not exists (
        select 1
        from public.locked_unpaid_reminder_events e
        where e.dossier_id = d.dossier_id
          and e.reminder_day = d.due_reminder_day
      )
    order by
      (d.effective_locked_at + make_interval(days => d.due_reminder_day)) asc,
      d.dossier_id asc
    limit p_limit
  loop
    v_event_id := null;
    v_outbound_email_id := null;
    v_message_type := 'locked_unpaid_reminder_day_' || r.due_reminder_day::text;

    if not p_apply then
      dossier_id := r.dossier_id;
      reminder_day := r.due_reminder_day;
      due_at := r.effective_locked_at + make_interval(days => r.due_reminder_day);
      locked_at := r.effective_locked_at;
      dossier_status := r.dossier_status;
      apply := false;
      queued := false;
      skipped_reason := null;
      outbound_email_id := null;
      reminder_event_id := null;
      message_type := v_message_type;
      return next;
      continue;
    end if;

    if nullif(trim(coalesce(r.customer_email, '')), '') is null then
      insert into public.locked_unpaid_reminder_events (
        request_id,
        environment,
        actor_ref,
        dossier_id,
        reminder_day,
        locked_at,
        due_at,
        status,
        outbound_email_id,
        message_type,
        event_data
      )
      values (
        coalesce(nullif(trim(p_request_id), ''), 'unknown'),
        coalesce(nullif(trim(p_environment), ''), 'unknown'),
        'system:locked-unpaid-reminder-worker',
        r.dossier_id,
        r.due_reminder_day,
        r.effective_locked_at,
        r.effective_locked_at + make_interval(days => r.due_reminder_day),
        'skipped_no_email',
        null,
        v_message_type,
        jsonb_build_object(
          'reminder_version', 1,
          'result', 'skipped_no_email',
          'privacy', jsonb_build_object(
            'pii_included', false,
            'has_dossier_foreign_key', false
          )
        )
      )
      on conflict (dossier_id, reminder_day) do nothing
      returning id into v_event_id;

      dossier_id := r.dossier_id;
      reminder_day := r.due_reminder_day;
      due_at := r.effective_locked_at + make_interval(days => r.due_reminder_day);
      locked_at := r.effective_locked_at;
      dossier_status := r.dossier_status;
      apply := true;
      queued := false;
      skipped_reason := 'missing_customer_email';
      outbound_email_id := null;
      reminder_event_id := v_event_id;
      message_type := v_message_type;
      return next;
      continue;
    end if;

    v_customer_name := trim(coalesce(r.customer_first_name, '') || ' ' || coalesce(r.customer_last_name, ''));
    if v_customer_name = '' then
      v_customer_name := 'klant';
    end if;

    v_subject := case r.due_reminder_day
      when 3 then 'Herinnering: rond je Enval-dossier af'
      when 7 then 'Tweede herinnering: je Enval-dossier staat nog open'
      else 'Laatste herinnering: je Enval-dossier staat nog open'
    end;

    v_body :=
      'Beste ' || v_customer_name || ',' || E'\n\n' ||
      'Je Enval-dossier is ingediend maar nog niet afgerond.' || E'\n\n' ||
      'Dossier-ID: ' || r.dossier_id::text || E'\n\n' ||
      'Rond je dossier af of neem contact met ons op als je denkt dat dit bericht niet klopt.' || E'\n\n' ||
      'Met vriendelijke groet,' || E'\n' ||
      'Enval';

    insert into public.locked_unpaid_reminder_events (
      request_id,
      environment,
      actor_ref,
      dossier_id,
      reminder_day,
      locked_at,
      due_at,
      status,
      outbound_email_id,
      message_type,
      event_data
    )
    values (
      coalesce(nullif(trim(p_request_id), ''), 'unknown'),
      coalesce(nullif(trim(p_environment), ''), 'unknown'),
      'system:locked-unpaid-reminder-worker',
      r.dossier_id,
      r.due_reminder_day,
      r.effective_locked_at,
      r.effective_locked_at + make_interval(days => r.due_reminder_day),
      'queued',
      null,
      v_message_type,
      jsonb_build_object(
        'reminder_version', 1,
        'result', 'queued',
        'privacy', jsonb_build_object(
          'pii_included', false,
          'has_dossier_foreign_key', false
        )
      )
    )
    on conflict (dossier_id, reminder_day) do nothing
    returning id into v_event_id;

    if v_event_id is null then
      dossier_id := r.dossier_id;
      reminder_day := r.due_reminder_day;
      due_at := r.effective_locked_at + make_interval(days => r.due_reminder_day);
      locked_at := r.effective_locked_at;
      dossier_status := r.dossier_status;
      apply := true;
      queued := false;
      skipped_reason := 'already_queued';
      outbound_email_id := null;
      reminder_event_id := null;
      message_type := v_message_type;
      return next;
      continue;
    end if;

    v_outbound_email_id := nextval(pg_get_serial_sequence('public.outbound_emails', 'id'));

    insert into public.outbound_emails (
      id,
      to_email,
      subject,
      body,
      status,
      priority,
      message_type,
      attempts,
      dossier_id,
      next_attempt_at
    )
    values (
      v_outbound_email_id,
      r.customer_email,
      v_subject,
      v_body,
      'queued',
      5,
      v_message_type,
      0,
      r.dossier_id,
      p_now
    );

    update public.locked_unpaid_reminder_events
    set outbound_email_id = v_outbound_email_id
    where id = v_event_id;

    insert into public.dossier_audit_events (
      dossier_id,
      actor_type,
      event_type,
      event_data
    )
    values (
      r.dossier_id,
      'system',
      'locked_unpaid_reminder_queued',
      jsonb_build_object(
        'request_id', coalesce(nullif(trim(p_request_id), ''), 'unknown'),
        'environment', coalesce(nullif(trim(p_environment), ''), 'unknown'),
        'actor_ref', 'system:locked-unpaid-reminder-worker',
        'reminder_day', r.due_reminder_day,
        'due_at', r.effective_locked_at + make_interval(days => r.due_reminder_day),
        'outbound_email_id', v_outbound_email_id,
        'message_type', v_message_type
      )
    );

    dossier_id := r.dossier_id;
    reminder_day := r.due_reminder_day;
    due_at := r.effective_locked_at + make_interval(days => r.due_reminder_day);
    locked_at := r.effective_locked_at;
    dossier_status := r.dossier_status;
    apply := true;
    queued := true;
    skipped_reason := null;
    outbound_email_id := v_outbound_email_id;
    reminder_event_id := v_event_id;
    message_type := v_message_type;
    return next;
  end loop;
end;
$$;

comment on function public.enval_queue_locked_unpaid_reminders(
  boolean,
  timestamptz,
  uuid,
  integer,
  integer[],
  text,
  text
)
is 'Queues idempotent locked/unpaid reminder emails for day 3/7/10. Does not mutate dossier lifecycle, exports, payments or retention cleanup.';

revoke all on function public.enval_queue_locked_unpaid_reminders(
  boolean,
  timestamptz,
  uuid,
  integer,
  integer[],
  text,
  text
) from public;

revoke all on function public.enval_queue_locked_unpaid_reminders(
  boolean,
  timestamptz,
  uuid,
  integer,
  integer[],
  text,
  text
) from anon;

revoke all on function public.enval_queue_locked_unpaid_reminders(
  boolean,
  timestamptz,
  uuid,
  integer,
  integer[],
  text,
  text
) from authenticated;

grant execute on function public.enval_queue_locked_unpaid_reminders(
  boolean,
  timestamptz,
  uuid,
  integer,
  integer[],
  text,
  text
) to service_role;
