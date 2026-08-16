-- ENVAL PILOT-PROFILE-02 declared profile and asserted service recipient.
-- Date: 2026-07-30
--
-- The immutable declaration source owns the exact timestamptz event. Existing
-- WP2A profile valid_from columns intentionally remain business-effective
-- dates. Their deterministic mapping is:
--   (canonical_source.valid_from AT TIME ZONE 'Europe/Amsterdam')::date
--
-- Profiles remain declared source projections, never verified identity, KvK,
-- address, representation, mandate, EAN, eligibility or evidence truth.
-- Asserted service_recipient rows remain non-operational case claims and are
-- never case_confirmed by this function.

create unique index app_party_person_versions_declared_source_uidx
  on public.app_party_person_versions (source_reference_id)
  where source_type = 'signup_applicant_declaration'
    and source_reference_type = 'app_party_declaration_sources';

create unique index app_party_organization_versions_declared_source_uidx
  on public.app_party_organization_versions (source_reference_id)
  where source_type = 'signup_applicant_declaration'
    and source_reference_type = 'app_party_declaration_sources';

create index app_case_party_roles_asserted_service_recipient_idx
  on public.app_case_party_roles (
    case_id,
    party_id,
    person_profile_version_id,
    organization_profile_version_id
  )
  where role_type = 'service_recipient'
    and claim_status = 'asserted';

create or replace function public.app_asserted_service_recipient_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.role_type <> 'service_recipient'
     or new.claim_status <> 'asserted' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.case_id::text, 0)
  );

  if exists (
    select 1
    from public.app_case_party_roles existing
    where existing.case_id = new.case_id
      and existing.role_type = 'service_recipient'
      and existing.claim_status = 'asserted'
      and existing.id is distinct from new.supersedes_id
      and not exists (
        select 1
        from public.app_case_party_roles successor
        where successor.supersedes_id = existing.id
      )
  ) then
    raise exception
      'at most one terminal asserted service_recipient is allowed per case';
  end if;

  return new;
end;
$$;

create trigger trg_app_asserted_service_recipient_guard
before insert on public.app_case_party_roles
for each row
execute function public.app_asserted_service_recipient_guard();

revoke all on function public.app_asserted_service_recipient_guard()
from public, anon, authenticated, service_role;

comment on function public.app_asserted_service_recipient_guard() is
'Focused insert guard for at most one terminal asserted service_recipient per case. It grants no operational, representation, mandate or authority truth.';

create or replace function public.app_bootstrap_customer_auth_v4(
  p_auth_user_id uuid,
  p_email_normalized text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_today date := current_date;
  v_failure_stage text :=
    pg_catalog.current_setting('enval.proof_failure_stage', true);
  v_v3_response jsonb;
  v_customer_id uuid;
  v_party_id uuid;
  v_party_kind text;
  v_relationship_count integer;
  v_dossier_count integer;
  v_source_count integer;
  v_source_customer_mismatch_count integer;
  v_source_shape_mismatch_count integer;
  v_fact_variant_count integer;
  v_case_count integer;
  v_profile_id uuid;
  v_profile_count integer;
  v_wrong_profile_kind_count integer;
  v_profile_created boolean := false;
  v_profile_date date;
  v_role_created_count integer := 0;
  v_role_resolved_count integer := 0;
  v_audit_count integer;
  v_current_role_count integer;
  v_matching_role_count integer;
  v_case record;
  v_source public.app_party_declaration_sources%rowtype;
begin
  begin
    v_v3_response := public.app_bootstrap_customer_auth_v3(
      p_auth_user_id,
      p_email_normalized,
      p_actor_ref,
      p_request_id,
      p_idempotency_scope,
      p_idempotency_key,
      p_payload_hash,
      p_ip_hash,
      p_user_agent_hash,
      p_environment
    );

    if coalesce((v_v3_response ->> 'ok')::boolean, false)
         is not true then
      return v_v3_response;
    end if;

    if v_v3_response ->> 'mode' <> 'auth_bootstrap_v2' then
      raise exception 'unexpected v3 bootstrap response';
    end if;

    begin
      v_customer_id := (v_v3_response ->> 'customer_id')::uuid;
    exception
      when others then
        raise exception 'invalid v3 customer response';
    end;

    select
      pg_catalog.count(*),
      pg_catalog.min(r.party_id::text)::uuid
      into v_relationship_count, v_party_id
    from public.app_customer_party_relationships r
    where r.customer_id = v_customer_id
      and r.relationship_role = 'account_owner'
      and r.valid_from <= v_today
      and (r.valid_to is null or v_today < r.valid_to)
      and not exists (
        select 1
        from public.app_customer_party_relationships successor
        where successor.supersedes_relationship_id = r.id
      );

    if v_relationship_count <> 1 then
      raise exception 'current customer party binding unavailable';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'declared_profile:' || v_party_id::text,
        0
      )
    );

    select p.party_kind
      into v_party_kind
    from public.app_parties p
    where p.id = v_party_id
    for update;

    if not found then
      raise exception 'customer party unavailable for profile promotion';
    end if;

    select pg_catalog.count(*)
      into v_dossier_count
    from public.app_customer_dossiers d
    where d.customer_id = v_customer_id
      and d.minimized_at is null
      and d.status <> 'expired_minimized';

    select
      pg_catalog.count(s.id),
      pg_catalog.count(*) filter (
        where s.id is not null
          and s.customer_id <> v_customer_id
      ),
      pg_catalog.count(*) filter (
        where s.id is not null
          and (
            s.account_type <> d.account_type
            or case s.account_type
              when 'particulier' then 'natural_person'
              when 'zakelijk' then 'organization'
              when 'vve' then 'organization'
              else null
            end is distinct from v_party_kind
            or case s.account_type
              when 'particulier' then 'natural_person'
              else 'organization'
            end is distinct from s.declaration_kind
            or (
              s.account_type = 'zakelijk'
              and s.organization_classification is distinct from 'business'
            )
            or (
              s.account_type = 'vve'
              and s.organization_classification is distinct from 'vve'
            )
          )
      )
      into
        v_source_count,
        v_source_customer_mismatch_count,
        v_source_shape_mismatch_count
    from public.app_customer_dossiers d
    left join public.app_party_declaration_sources s
      on s.dossier_id = d.id
    where d.customer_id = v_customer_id
      and d.minimized_at is null
      and d.status <> 'expired_minimized';

    if v_source_count = 0 then
      return v_v3_response;
    end if;

    if v_source_count <> v_dossier_count then
      raise exception using
        errcode = 'P2001',
        message = 'party_declaration_incomplete';
    end if;

    if v_source_customer_mismatch_count <> 0
       or v_source_shape_mismatch_count <> 0 then
      raise exception using
        errcode = 'P2002',
        message = 'party_declaration_conflict';
    end if;

    if v_party_kind = 'natural_person' then
      select pg_catalog.count(distinct pg_catalog.jsonb_build_array(
        s.person_first_name,
        s.person_last_name,
        s.person_full_name
      ))
        into v_fact_variant_count
      from public.app_customer_dossiers d
      join public.app_party_declaration_sources s
        on s.dossier_id = d.id
      where d.customer_id = v_customer_id
        and d.minimized_at is null
        and d.status <> 'expired_minimized';
    else
      select pg_catalog.count(distinct pg_catalog.jsonb_build_array(
        s.organization_classification,
        s.organization_legal_name,
        s.trade_register_number
      ))
        into v_fact_variant_count
      from public.app_customer_dossiers d
      join public.app_party_declaration_sources s
        on s.dossier_id = d.id
      where d.customer_id = v_customer_id
        and d.minimized_at is null
        and d.status <> 'expired_minimized';
    end if;

    if v_fact_variant_count <> 1 then
      raise exception using
        errcode = 'P2002',
        message = 'party_declaration_conflict';
    end if;

    select s.*
      into v_source
    from public.app_customer_dossiers d
    join public.app_party_declaration_sources s
      on s.dossier_id = d.id
    where d.customer_id = v_customer_id
      and d.minimized_at is null
      and d.status <> 'expired_minimized'
    order by s.valid_from, s.declared_at, s.id
    limit 1;

    v_profile_date :=
      (v_source.valid_from at time zone 'Europe/Amsterdam')::date;

    if v_party_kind = 'natural_person' then
      select pg_catalog.count(*), pg_catalog.min(pv.id::text)::uuid
        into v_profile_count, v_profile_id
      from public.app_party_person_versions pv
      where pv.party_id = v_party_id
        and not exists (
          select 1
          from public.app_party_person_versions successor
          where successor.supersedes_person_version_id = pv.id
        );

      select pg_catalog.count(*)
        into v_wrong_profile_kind_count
      from public.app_party_organization_versions ov
      where ov.party_id = v_party_id
        and not exists (
          select 1
          from public.app_party_organization_versions successor
          where successor.supersedes_organization_version_id = ov.id
        );

      if v_wrong_profile_kind_count <> 0 or v_profile_count > 1 then
        raise exception using
          errcode = 'P2003',
          message = 'party_profile_conflict';
      end if;

      if v_profile_count = 1 then
        if not exists (
          select 1
          from public.app_party_person_versions pv
          where pv.id = v_profile_id
            and pv.party_id = v_party_id
            and pv.full_name = v_source.person_full_name
            and pv.valid_from = v_profile_date
            and pv.valid_to is null
            and pv.source_type = 'signup_applicant_declaration'
            and pv.source_reference_type =
              'app_party_declaration_sources'
            and pv.source_reference_id = v_source.id::text
        ) then
          raise exception using
            errcode = 'P2003',
            message = 'party_profile_conflict';
        end if;
      else
        insert into public.app_party_person_versions (
          party_id,
          full_name,
          valid_from,
          valid_to,
          source_type,
          source_reference_type,
          source_reference_id,
          request_id,
          actor_type,
          actor_ref,
          recorded_at,
          supersedes_person_version_id
        )
        values (
          v_party_id,
          v_source.person_full_name,
          v_profile_date,
          null,
          'signup_applicant_declaration',
          'app_party_declaration_sources',
          v_source.id::text,
          v_source.source_request_id,
          'customer',
          p_actor_ref,
          v_now,
          null
        )
        returning id into v_profile_id;

        v_profile_created := true;
      end if;
    else
      select pg_catalog.count(*), pg_catalog.min(ov.id::text)::uuid
        into v_profile_count, v_profile_id
      from public.app_party_organization_versions ov
      where ov.party_id = v_party_id
        and not exists (
          select 1
          from public.app_party_organization_versions successor
          where successor.supersedes_organization_version_id = ov.id
        );

      select pg_catalog.count(*)
        into v_wrong_profile_kind_count
      from public.app_party_person_versions pv
      where pv.party_id = v_party_id
        and not exists (
          select 1
          from public.app_party_person_versions successor
          where successor.supersedes_person_version_id = pv.id
        );

      if v_wrong_profile_kind_count <> 0 or v_profile_count > 1 then
        raise exception using
          errcode = 'P2003',
          message = 'party_profile_conflict';
      end if;

      if v_profile_count = 1 then
        if not exists (
          select 1
          from public.app_party_organization_versions ov
          where ov.id = v_profile_id
            and ov.party_id = v_party_id
            and ov.legal_name = v_source.organization_legal_name
            and ov.organization_classification =
              v_source.organization_classification
            and ov.legal_form is null
            and ov.trade_register_number is null
            and ov.valid_from = v_profile_date
            and ov.valid_to is null
            and ov.source_type = 'signup_applicant_declaration'
            and ov.source_reference_type =
              'app_party_declaration_sources'
            and ov.source_reference_id = v_source.id::text
        ) then
          raise exception using
            errcode = 'P2003',
            message = 'party_profile_conflict';
        end if;
      else
        insert into public.app_party_organization_versions (
          party_id,
          legal_name,
          organization_classification,
          legal_form,
          trade_register_number,
          valid_from,
          valid_to,
          source_type,
          source_reference_type,
          source_reference_id,
          request_id,
          actor_type,
          actor_ref,
          recorded_at,
          supersedes_organization_version_id
        )
        values (
          v_party_id,
          v_source.organization_legal_name,
          v_source.organization_classification,
          null,
          null,
          v_profile_date,
          null,
          'signup_applicant_declaration',
          'app_party_declaration_sources',
          v_source.id::text,
          v_source.source_request_id,
          'customer',
          p_actor_ref,
          v_now,
          null
        )
        returning id into v_profile_id;

        v_profile_created := true;
      end if;
    end if;

    if v_failure_stage = 'after_profile' then
      raise exception 'proof_failure_after_profile';
    end if;

    select pg_catalog.count(*)
      into v_case_count
    from public.app_customer_dossiers d
    join public.app_cases c
      on c.customer_id = d.customer_id
     and c.source_class = 'app_customer_dossier'
     and c.source_ref = d.id::text
    where d.customer_id = v_customer_id
      and d.minimized_at is null
      and d.status <> 'expired_minimized';

    if v_case_count <> v_dossier_count then
      raise exception 'canonical customer case coverage unavailable';
    end if;

    for v_case in
      select c.id
      from public.app_customer_dossiers d
      join public.app_cases c
        on c.customer_id = d.customer_id
       and c.source_class = 'app_customer_dossier'
       and c.source_ref = d.id::text
      where d.customer_id = v_customer_id
        and d.minimized_at is null
        and d.status <> 'expired_minimized'
      order by c.id
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_case.id::text, 0)
      );

      select
        pg_catalog.count(*),
        pg_catalog.count(*) filter (
          where r.party_id = v_party_id
            and r.claim_status = 'asserted'
            and (
              (
                v_party_kind = 'natural_person'
                and r.person_profile_version_id = v_profile_id
                and r.organization_profile_version_id is null
              )
              or
              (
                v_party_kind = 'organization'
                and r.organization_profile_version_id = v_profile_id
                and r.person_profile_version_id is null
              )
            )
        )
        into v_current_role_count, v_matching_role_count
      from public.app_case_party_roles r
      where r.case_id = v_case.id
        and r.role_type = 'service_recipient'
        and not exists (
          select 1
          from public.app_case_party_roles successor
          where successor.supersedes_id = r.id
        );

      if v_current_role_count > 1
         or (
           v_current_role_count = 1
           and v_matching_role_count <> 1
         ) then
        raise exception using
          errcode = 'P2004',
          message = 'party_role_conflict';
      end if;

      if v_current_role_count = 1 then
        v_role_resolved_count := v_role_resolved_count + 1;
      else
        insert into public.app_case_party_roles (
          case_id,
          party_id,
          person_profile_version_id,
          organization_profile_version_id,
          role_type,
          claim_status,
          valid_from,
          valid_to,
          recorded_at,
          recorded_by_actor_type,
          recorded_by_actor_ref,
          source_class,
          source_ref,
          request_id,
          decision_at,
          decided_by_actor_type,
          decided_by_actor_ref,
          decision_reason,
          supersedes_id,
          supersession_reason
        )
        values (
          v_case.id,
          v_party_id,
          case
            when v_party_kind = 'natural_person' then v_profile_id
            else null
          end,
          case
            when v_party_kind = 'organization' then v_profile_id
            else null
          end,
          'service_recipient',
          'asserted',
          v_now,
          null,
          v_now,
          'customer',
          p_actor_ref,
          'signup_applicant_declaration',
          v_source.id::text,
          p_request_id,
          null,
          null,
          null,
          null,
          null,
          null
        );

        v_role_created_count := v_role_created_count + 1;
      end if;
    end loop;

    if v_failure_stage = 'after_roles' then
      raise exception 'proof_failure_after_roles';
    end if;

    select pg_catalog.count(*)
      into v_audit_count
    from public.app_audit_events a
    where a.event_type =
        'declared_profile_asserted_service_recipient_linked'
      and a.customer_id = v_customer_id
      and a.idempotency_key = p_idempotency_key;

    if v_audit_count > 1 then
      raise exception 'ambiguous declared profile activation audit';
    end if;

    if not (
      coalesce(
        (v_v3_response ->> 'replayed')::boolean,
        false
      )
      and v_audit_count = 1
    ) then
      if v_audit_count <> 0 then
        raise exception 'conflicting declared profile activation audit';
      end if;

      if v_failure_stage = 'during_audit' then
        raise exception 'proof_failure_during_audit';
      end if;

      insert into public.app_audit_events (
        event_type,
        scope_type,
        scope_id,
        customer_id,
        dossier_id,
        request_id,
        idempotency_key,
        actor_type,
        actor_ref,
        ip_hash,
        user_agent_hash,
        event_data,
        created_at
      )
      values (
        'declared_profile_asserted_service_recipient_linked',
        'customer',
        v_customer_id,
        v_customer_id,
        null,
        p_request_id,
        p_idempotency_key,
        'customer',
        p_actor_ref,
        p_ip_hash,
        p_user_agent_hash,
        pg_catalog.jsonb_build_object(
          'request_id', p_request_id,
          'customer_reference', v_customer_id,
          'party_reference', v_party_id,
          'canonical_declaration_source_reference', v_source.id,
          'profile_reference', v_profile_id,
          'profile_outcome',
            case when v_profile_created then 'created' else 'resolved' end,
          'asserted_case_claim_created_count', v_role_created_count,
          'asserted_case_claim_resolved_count', v_role_resolved_count,
          'idempotency_scope', p_idempotency_scope,
          'idempotency_key', p_idempotency_key,
          'environment', p_environment,
          'recorded_at', v_now
        ),
        v_now
      );
    end if;

    update public.app_idempotency_keys
    set response_status = 200,
        response_body = v_v3_response,
        completed_at = v_now
    where scope = p_idempotency_scope
      and key = p_idempotency_key
      and payload_hash = p_payload_hash;

    if not found then
      raise exception 'v4 idempotency finalize failed';
    end if;

    return v_v3_response;
  exception
    when sqlstate 'P2001' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'party_declaration_incomplete',
        'error', 'Profielgegevens zijn nog niet volledig beschikbaar.'
      );
    when sqlstate 'P2002' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'party_declaration_conflict',
        'error', 'Profielgegevens vereisen handmatige controle.'
      );
    when sqlstate 'P2003' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'party_profile_conflict',
        'error', 'Profielgegevens vereisen handmatige controle.'
      );
    when sqlstate 'P2004' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'party_role_conflict',
        'error', 'Dossierrollen vereisen handmatige controle.'
      );
  end;
end;
$$;

revoke all on function public.app_bootstrap_customer_auth_v4(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public;

revoke all on function public.app_bootstrap_customer_auth_v4(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from anon;

revoke all on function public.app_bootstrap_customer_auth_v4(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from authenticated;

revoke all on function public.app_bootstrap_customer_auth_v4(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from service_role;

grant execute on function public.app_bootstrap_customer_auth_v4(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

comment on function public.app_bootstrap_customer_auth_v4(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
'Atomic service-role-only auth bootstrap v4. It reuses v3, promotes complete equivalent immutable signup declarations to one declared WP2A profile using Europe/Amsterdam business-date mapping, and creates or resolves one non-operational asserted service_recipient claim per canonical case. No verified identity, KvK, address, authority, mandate, EAN, eligibility or evidence truth.';
