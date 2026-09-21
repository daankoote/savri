#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TENANT_ENVAL_MIGRATION_CHAIN as chain,
} from "../tools/enval-migration-chain-manifest.mjs";
import { resolveSupabaseTarget } from "../tools/enval-supabase-target.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CONTAINER = "supabase_db_enval";
const ACTIVE_DATABASE = "postgres";
const DATABASE = `enval_mig02_chain_${process.pid}`;
const FRESH_ONLY = process.argv.includes("--fresh-only");

function fail(code) {
  throw new Error(code);
}
function assert(value, code) {
  if (!value) fail(code);
}
function scrub(value) {
  return String(value ?? "")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replace(/[0-9a-f]{64}/gi, "[hash]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .split(/\r?\n/).slice(0, 20).join("\n").slice(0, 4_000);
}
function docker(args, input) {
  const result = spawnSync("docker", [
    "exec",
    ...(input === undefined ? [] : ["-i"]),
    CONTAINER,
    ...args,
  ], {
    cwd: ROOT,
    input,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) fail(scrub(result.stderr || "docker_failed"));
  return result.stdout.trim();
}
function psql(database, sql) {
  return docker([
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
  ], sql);
}
function sha256(path) {
  return createHash("sha256").update(readFileSync(resolve(ROOT, path))).digest(
    "hex",
  );
}
function activeFingerprint() {
  return psql(
    ACTIVE_DATABASE,
    `begin read only;
    with current_state as (
      select distinct on (workforce_identity_id) workforce_identity_id, state
      from public.app_workforce_identity_states
      where effective_at <= clock_timestamp()
      order by workforce_identity_id, effective_at desc, recorded_at desc
    ), current_seniority as (
      select distinct on (workforce_identity_id) workforce_identity_id, seniority
      from public.app_workforce_seniority_assignments
      where effective_at <= clock_timestamp()
      order by workforce_identity_id, effective_at desc, recorded_at desc
    )
    select concat_ws('|',
      (select count(*) from supabase_migrations.schema_migrations),
      (select count(*) from public.app_customers),
      (select count(*) from public.app_cases),
      (select count(*) from public.app_customer_access_grants),
      (select count(*) from public.app_signup_signature_evidence),
      (select count(*) from public.app_workforce_identities),
      (select count(*) from public.app_workforce_identities identity
        join current_state state on state.workforce_identity_id=identity.id and state.state='active'
        join current_seniority seniority on seniority.workforce_identity_id=identity.id and seniority.seniority='admin'),
      (select count(*) from public.app_evidence_review_decisions),
      (select count(*) from public.app_audit_events),
      (select count(*) from public.app_idempotency_keys)
    ); rollback;`,
  ).split("\n").find((line) => /^\d+(\|\d+){9}$/.test(line));
}

function proveTerminalProjectionGuard(database) {
  const results = psql(
    database,
    `begin;
    create or replace function public.app_customer_correction_handoff_read_v6(
      p_auth_user_id uuid, p_case_ref text
    ) returns jsonb language sql stable security definer set search_path=''
    as $fn$ select pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', p_case_ref, 'handoff', null
    ) $fn$;
    select public.app_customer_correction_safe_projection_v1(
      '91000000-0000-4000-8000-000000000099', 'CASE-PROJECTION-PROOF'
    ) = pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', 'CASE-PROJECTION-PROOF', 'handoff', null
    );

    create or replace function public.app_customer_correction_handoff_read_v6(
      p_auth_user_id uuid, p_case_ref text
    ) returns jsonb language sql stable security definer set search_path=''
    as $fn$ select '1'::jsonb $fn$;
    select public.app_customer_correction_safe_projection_v1(
      '91000000-0000-4000-8000-000000000099', 'CASE-PROJECTION-PROOF'
    )->>'code' = 'correction_handoff_reconstruction_failed';

    create or replace function public.app_customer_correction_handoff_read_v6(
      p_auth_user_id uuid, p_case_ref text
    ) returns jsonb language sql stable security definer set search_path=''
    as $fn$ select pg_catalog.jsonb_build_object(
      'ok', 'true', 'status', 200, 'code', 'not_available',
      'case_ref', p_case_ref, 'handoff', null
    ) $fn$;
    select public.app_customer_correction_safe_projection_v1(
      '91000000-0000-4000-8000-000000000099', 'CASE-PROJECTION-PROOF'
    )->>'code' = 'correction_handoff_reconstruction_failed';

    create or replace function public.app_customer_correction_handoff_read_v6(
      p_auth_user_id uuid, p_case_ref text
    ) returns jsonb language sql stable security definer set search_path=''
    as $fn$ select '[]'::jsonb $fn$;
    select public.app_customer_correction_safe_projection_v1(
      '91000000-0000-4000-8000-000000000099', 'CASE-PROJECTION-PROOF'
    )->>'code' = 'correction_handoff_reconstruction_failed';

    create or replace function public.app_customer_correction_handoff_read_v6(
      p_auth_user_id uuid, p_case_ref text
    ) returns jsonb language sql stable security definer set search_path=''
    as $fn$ select pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', p_case_ref
    ) $fn$;
    select public.app_customer_correction_safe_projection_v1(
      '91000000-0000-4000-8000-000000000099', 'CASE-PROJECTION-PROOF'
    )->>'code' = 'correction_handoff_reconstruction_failed';

    create or replace function public.app_customer_correction_handoff_read_v6(
      p_auth_user_id uuid, p_case_ref text
    ) returns jsonb language sql stable security definer set search_path=''
    as $fn$ select pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', p_case_ref, 'handoff', null, 'unexpected', true
    ) $fn$;
    select public.app_customer_correction_safe_projection_v1(
      '91000000-0000-4000-8000-000000000099', 'CASE-PROJECTION-PROOF'
    )->>'code' = 'correction_handoff_reconstruction_failed';
    rollback;`,
  ).split("\n").filter((line) => line === "t");
  assert(results.length === 6, "terminal_projection_guard_behavior_failed");
}

const catalogSql = `
with catalog as (
  select 'TABLE' category, c.relname identity,
    concat_ws('|',c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity) definition
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relname like 'app\\_%'
  union all
  select 'COLUMN', c.relname||'.'||a.attname,
    concat_ws('|',a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,
      coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attidentity,a.attgenerated)
  from pg_attribute a join pg_class c on c.oid=a.attrelid
  join pg_namespace n on n.oid=c.relnamespace
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where n.nspname='public' and c.relname like 'app\\_%' and a.attnum>0 and not a.attisdropped
  union all
  select 'TYPE',t.typname,concat_ws('|',t.typtype,coalesce(format_type(t.typbasetype,t.typtypmod),''))
  from pg_type t join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='public' and t.typtype in ('d','e')
  union all
  select 'CONSTRAINT',c.relname||'.'||con.conname,pg_get_constraintdef(con.oid,true)
  from pg_constraint con join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname like 'app\\_%'
  union all
  select 'INDEX',tablename||'.'||indexname,indexdef
  from pg_indexes where schemaname='public' and tablename like 'app\\_%'
  union all
  select 'FUNCTION',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'app\\_%'
  union all
  select 'TRIGGER',c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid,true)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname like 'app\\_%' and not t.tgisinternal
  union all
  select 'POLICY',c.relname||'.'||p.polname,
    concat_ws('|',p.polpermissive,p.polcmd,
      coalesce((select string_agg(pg_get_userbyid(role_oid),',' order by pg_get_userbyid(role_oid)) from unnest(p.polroles) role_oid),''),
      coalesce(pg_get_expr(p.polqual,p.polrelid),''),coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
  from pg_policy p join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname like 'app\\_%'
  union all
  select 'TABLE_ACL',c.relname||'.'||coalesce(pg_get_userbyid(acl.grantee),'PUBLIC')||'.'||acl.privilege_type,
    concat_ws('|',pg_get_userbyid(acl.grantor),acl.is_grantable)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
  where n.nspname='public' and c.relname like 'app\\_%' and c.relkind in ('r','p')
  union all
  select 'FUNCTION_ACL',p.proname||'('||pg_get_function_identity_arguments(p.oid)||').'||
    coalesce(pg_get_userbyid(acl.grantee),'PUBLIC')||'.'||acl.privilege_type,
    concat_ws('|',pg_get_userbyid(acl.grantor),acl.is_grantable)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
  where n.nspname='public' and p.proname like 'app\\_%'
)
select category||E'\\t'||identity||E'\\t'||definition
from catalog order by category,identity,definition;
`;

function setupSql() {
  return `
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create table auth.users (
      instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255),
      email varchar(255), encrypted_password varchar(255),
      email_confirmed_at timestamptz, invited_at timestamptz,
      confirmation_token varchar(255), confirmation_sent_at timestamptz,
      recovery_token varchar(255), recovery_sent_at timestamptz,
      email_change_token_new varchar(255), email_change varchar(255),
      email_change_sent_at timestamptz, last_sign_in_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean,
      created_at timestamptz, updated_at timestamptz, phone text,
      phone_confirmed_at timestamptz, phone_change text, phone_change_token text,
      phone_change_sent_at timestamptz,
      confirmed_at timestamptz generated always as (least(email_confirmed_at,phone_confirmed_at)) stored,
      email_change_token_current text, email_change_confirm_status smallint default 0,
      banned_until timestamptz, reauthentication_token text,
      reauthentication_sent_at timestamptz, is_sso_user boolean default false not null,
      deleted_at timestamptz, is_anonymous boolean default false not null
    );
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text
    );
  `;
}

function subjectRefGuardProofSql() {
  return `
    begin;
    set local session_replication_role = replica;
    insert into public.app_evidence_files (
      id, case_id, promotion_id, document_type, source_class, source_ref,
      created_at, created_by_actor_ref, request_id
    ) values
      ('92000000-0000-4000-8000-000000000031',
       '92000000-0000-4000-8000-000000000001',
       '92000000-0000-4000-8000-000000000051',
       'energy_bill_or_contract','signup_quarantine_file','proof-source-a',
       clock_timestamp(),'proof:subject-ref-guard','proof-file-a'),
      ('92000000-0000-4000-8000-000000000032',
       '92000000-0000-4000-8000-000000000001',
       '92000000-0000-4000-8000-000000000052',
       'energy_bill_or_contract','signup_quarantine_file','proof-source-b',
       clock_timestamp(),'proof:subject-ref-guard','proof-file-b');
    insert into public.app_evidence_versions (
      id, evidence_file_id, version_number, source_intake_file_id,
      storage_bucket, storage_path, detected_mime_type, size_bytes, sha256,
      status, source_confirmed_at, created_at, request_id, idempotency_key
    ) values (
      '92000000-0000-4000-8000-000000000041',
      '92000000-0000-4000-8000-000000000031',1,
      '92000000-0000-4000-8000-000000000061',
      'proof-bucket','proof/subject-ref','application/pdf',1,
      '${"a".repeat(64)}','confirmed_awaiting_review',clock_timestamp(),
      clock_timestamp(),'proof-version','proof-version'
    ), (
      '92000000-0000-4000-8000-000000000042',
      '92000000-0000-4000-8000-000000000031',2,
      '92000000-0000-4000-8000-000000000062',
      'proof-bucket','proof/subject-ref-stale','application/pdf',1,
      '${"a".repeat(64)}','confirmed_awaiting_review',clock_timestamp(),
      clock_timestamp(),'proof-version-stale','proof-version-stale'
    );
    insert into public.app_evidence_review_customer_submissions (
      id, submission_reference, handoff_id, case_id, customer_id,
      correction_generation, parent_snapshot_id, parent_snapshot_sha256,
      resulting_snapshot_id, resulting_snapshot_sha256,
      signature_evidence_id, signing_method_id, signing_method_version,
      correction_legal_bundle_version, correction_legal_bundle_sha256,
      auth_user_id, customer_identity_id, actor_ref,
      normalized_payload_sha256, request_id, idempotency_key, environment,
      finalized_at, recorded_at
    ) values
      ('92000000-0000-4000-8000-000000000011','CRS-0000000000000001',
       '92000000-0000-4000-8000-000000000071',
       '92000000-0000-4000-8000-000000000001',
       '92000000-0000-4000-8000-000000000081',1,
       '92000000-0000-4000-8000-000000000091','${"1".repeat(64)}',
       '92000000-0000-4000-8000-000000000021','${"2".repeat(64)}',
       '92000000-0000-4000-8000-000000000101','typed_name_otp_v1','1',
       'customer-correction-confirmation-nl-v1','${"3".repeat(64)}',
       '92000000-0000-4000-8000-000000000111',
       '92000000-0000-4000-8000-000000000121',
       'app_customer_identity:92000000-0000-4000-8000-000000000121',
       '${"4".repeat(64)}','proof-submission-a','proof-submission-a','local',
       clock_timestamp(),clock_timestamp()),
      ('92000000-0000-4000-8000-000000000012','CRS-0000000000000002',
       '92000000-0000-4000-8000-000000000072',
       '92000000-0000-4000-8000-000000000002',
       '92000000-0000-4000-8000-000000000082',1,
       '92000000-0000-4000-8000-000000000092','${"1".repeat(64)}',
       '92000000-0000-4000-8000-000000000023','${"2".repeat(64)}',
       '92000000-0000-4000-8000-000000000102','typed_name_otp_v1','1',
       'customer-correction-confirmation-nl-v1','${"3".repeat(64)}',
       '92000000-0000-4000-8000-000000000112',
       '92000000-0000-4000-8000-000000000122',
       'app_customer_identity:92000000-0000-4000-8000-000000000122',
       '${"4".repeat(64)}','proof-submission-b','proof-submission-b','local',
       clock_timestamp(),clock_timestamp()),
      ('92000000-0000-4000-8000-000000000013','CRS-0000000000000003',
       '92000000-0000-4000-8000-000000000073',
       '92000000-0000-4000-8000-000000000001',
       '92000000-0000-4000-8000-000000000083',1,
       '92000000-0000-4000-8000-000000000093','${"1".repeat(64)}',
       '92000000-0000-4000-8000-000000000022','${"2".repeat(64)}',
       '92000000-0000-4000-8000-000000000103','typed_name_otp_v1','1',
       'customer-correction-confirmation-nl-v1','${"3".repeat(64)}',
       '92000000-0000-4000-8000-000000000113',
       '92000000-0000-4000-8000-000000000123',
       'app_customer_identity:92000000-0000-4000-8000-000000000123',
       '${
    "4".repeat(64)
  }','proof-submission-stale','proof-submission-stale','local',
       clock_timestamp(),clock_timestamp());
    set local session_replication_role = origin;

    create or replace function public.app_evidence_fact_review_manifest_v1(
      p_case_id uuid
    ) returns jsonb language plpgsql security definer stable
    set search_path = '' as $manifest$
    declare
      v_subject jsonb := pg_catalog.jsonb_build_object(
        'subject_ref','FRS-${"e".repeat(64)}',
        'signing_snapshot_id','92000000-0000-4000-8000-000000000021',
        'evidence_file_id','92000000-0000-4000-8000-000000000031',
        'evidence_version_id','92000000-0000-4000-8000-000000000041',
        'fact_id','partyName','fact_key','partyName',
        'scope_ref','FRSCOPE-${"1".repeat(64)}',
        'value_sha256','${"c".repeat(64)}','value_status','PRESENT'
      );
    begin
      if p_case_id <> '92000000-0000-4000-8000-000000000001'::uuid then
        return pg_catalog.jsonb_build_object('ok',true,'subjects','[]'::jsonb);
      end if;
      return pg_catalog.jsonb_build_object(
        'ok',true,
        'subjects',case
          when pg_catalog.current_setting(
            'enval.subject_ref_ambiguity',true
          ) = 'on' then pg_catalog.jsonb_build_array(v_subject,v_subject)
          else pg_catalog.jsonb_build_array(v_subject)
        end
      );
    end;
    $manifest$;

    create function pg_temp.try_subject_ref_item(
      p_submission_id uuid, p_item_index integer, p_evidence_file_id uuid,
      p_evidence_version_id uuid, p_evidence_sha256 text,
      p_fact_id text, p_fact_key text, p_scope_ref text,
      p_value_sha256 text
    ) returns boolean language plpgsql as $proof$
    begin
      insert into public.app_evidence_review_customer_submission_items (
        id, submission_id, item_index, handoff_subject_ref,
        resulting_subject_ref, fact_id, fact_key, scope_ref,
        evidence_file_id, evidence_version_id, evidence_sha256,
        action_requirement, prior_canonical_value, prior_value_sha256,
        submitted_value, resulting_canonical_value, resulting_value_sha256,
        recorded_at
      ) values (
        extensions.gen_random_uuid(),p_submission_id,p_item_index,
        'FRS-' || pg_catalog.lpad(pg_catalog.to_hex(p_item_index),64,'0'),
        'FRS-${"0".repeat(64)}',p_fact_id,p_fact_key,p_scope_ref,
        p_evidence_file_id,p_evidence_version_id,p_evidence_sha256,
        'VALUE_PLUS_DOCUMENT_REPLACEMENT','Old value','${"d".repeat(64)}',
        'New value','New value',p_value_sha256,clock_timestamp()
      );
      return true;
    exception when others then
      return false;
    end;
    $proof$;

    create temporary table subject_ref_outcome (
      label text primary key, succeeded boolean not null
    );
    set local enval.subject_ref_ambiguity = 'off';
    insert into subject_ref_outcome values
      ('valid',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000011',1,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000041','${"a".repeat(64)}',
        'partyName','partyName','FRSCOPE-${"1".repeat(64)}','${
    "c".repeat(64)
  }')),
      ('hash-mismatch',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000011',2,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000041','${"b".repeat(64)}',
        'partyName','partyName','FRSCOPE-${"1".repeat(64)}','${
    "c".repeat(64)
  }')),
      ('document-mismatch',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000011',3,
        '92000000-0000-4000-8000-000000000032',
        '92000000-0000-4000-8000-000000000041','${"a".repeat(64)}',
        'partyName','partyName','FRSCOPE-${"1".repeat(64)}','${
    "c".repeat(64)
  }')),
      ('value-mismatch',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000011',4,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000041','${"a".repeat(64)}',
        'partyName','partyName','FRSCOPE-${"1".repeat(64)}','${
    "d".repeat(64)
  }')),
      ('version-mismatch',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000011',6,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000042','${"a".repeat(64)}',
        'partyName','partyName','FRSCOPE-${"1".repeat(64)}','${
    "c".repeat(64)
  }')),
      ('fact-id-mismatch',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000011',7,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000041','${"a".repeat(64)}',
        'otherFact','partyName','FRSCOPE-${"1".repeat(64)}','${
    "c".repeat(64)
  }')),
      ('fact-key-mismatch',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000011',8,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000041','${"a".repeat(64)}',
        'partyName','otherFact','FRSCOPE-${"1".repeat(64)}','${
    "c".repeat(64)
  }')),
      ('scope-mismatch',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000011',9,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000041','${"a".repeat(64)}',
        'partyName','partyName','FRSCOPE-${"2".repeat(64)}','${
    "c".repeat(64)
  }')),
      ('cross-case',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000012',1,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000041','${"a".repeat(64)}',
        'partyName','partyName','FRSCOPE-${"1".repeat(64)}','${
    "c".repeat(64)
  }')),
      ('stale-snapshot',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000013',1,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000041','${"a".repeat(64)}',
        'partyName','partyName','FRSCOPE-${"1".repeat(64)}','${
    "c".repeat(64)
  }'));
    set local enval.subject_ref_ambiguity = 'on';
    insert into subject_ref_outcome values
      ('ambiguous',pg_temp.try_subject_ref_item(
        '92000000-0000-4000-8000-000000000011',5,
        '92000000-0000-4000-8000-000000000031',
        '92000000-0000-4000-8000-000000000041','${"a".repeat(64)}',
        'partyName','partyName','FRSCOPE-${"1".repeat(64)}','${
    "c".repeat(64)
  }'));

    select pg_catalog.concat_ws('|',
      (select count(*) from subject_ref_outcome
        where label='valid' and succeeded),
      (select count(*) from subject_ref_outcome
        where label<>'valid' and not succeeded),
      (select count(*)
        from public.app_evidence_review_customer_submission_items),
      (select count(*)
        from public.app_evidence_review_customer_submission_items
        where resulting_subject_ref='FRS-${"e".repeat(64)}'),
      (select count(*)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       cross join lateral pg_catalog.aclexplode(p.proacl) acl
       where n.nspname='public'
         and p.proname='app_customer_correction_submission_subject_ref_v1'
         and acl.privilege_type='EXECUTE'
         and (acl.grantee=0 or pg_catalog.pg_get_userbyid(acl.grantee)
           in ('anon','authenticated','service_role'))),
      (select count(*)
       from pg_catalog.pg_trigger trigger
       join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
       join pg_catalog.pg_namespace namespace
         on namespace.oid=relation.relnamespace
       where namespace.nspname='public'
         and relation.relname='app_evidence_review_customer_submission_items'
         and trigger.tgname='trg_app_customer_submission_item_subject_ref'
         and not trigger.tgisinternal)
    );
    rollback;
  `;
}

const target = resolveSupabaseTarget({
  target: "TENANT_ENVAL",
  operation: "inspect",
  cwd: ROOT,
});
assert(target.localOnly && target.projectId === "enval", "target_guard_failed");
const before = FRESH_ONLY ? null : activeFingerprint();
if (!FRESH_ONLY) assert(before, "active_fingerprint_missing");

try {
  const activeFiles = readdirSync(resolve(ROOT, chain.activeRoot))
    .filter((name) => name.endsWith(".sql")).sort();
  const expectedActive = [
    chain.baseline.path,
    ...chain.forwardTail.map((item) => item.path),
  ]
    .map((path) => basename(path)).sort();
  assert(
    activeFiles.join("|") === expectedActive.join("|"),
    "active_chain_not_exact",
  );
  assert(
    chain.currentPresentAppMigrations.length === 29,
    "present_app_cohort_not_exact",
  );
  assert(
    chain.absentLegacyMigrations.length === 10,
    "absent_legacy_cohort_not_exact",
  );
  assert(
    chain.excludedConnectionMigrations.length === 2,
    "connection_cohort_not_exact",
  );
  assert(
    sha256(chain.baseline.path) === chain.baseline.sha256,
    "baseline_hash_mismatch",
  );
  for (const item of chain.forwardTail) {
    assert(sha256(item.path) === item.sha256, "tail_hash_mismatch");
  }
  for (
    const cohort of [
      chain.currentPresentAppMigrations,
      chain.absentLegacyMigrations,
      chain.excludedConnectionMigrations,
    ]
  ) {
    for (const item of cohort) {
      assert(existsSync(resolve(ROOT, item.path)), "archive_source_missing");
      assert(sha256(item.path) === item.sha256, "archive_source_hash_mismatch");
      assert(
        !item.path.startsWith(`${chain.activeRoot}/`),
        "archive_inside_active_root",
      );
    }
  }
  const baseline = readFileSync(resolve(ROOT, chain.baseline.path), "utf8");
  assert(
    !/^(INSERT INTO|UPDATE|DELETE FROM|MERGE INTO) public\./im.test(baseline) &&
      !/COPY public\./.test(baseline),
    "baseline_contains_population",
  );
  assert(
    !baseline.includes("r6-bound-identity-backfill") &&
      !baseline.includes(
        "perform public.app_materialize_signed_signup_declared_data_v1(v_intake_id)",
      ),
    "historical_transformation_replayed",
  );

  docker(["createdb", "-U", "postgres", "-T", "template0", DATABASE]);
  psql(DATABASE, setupSql());
  psql(DATABASE, baseline);
  psql(
    DATABASE,
    `insert into supabase_migrations.schema_migrations(version,name) values ('${chain.baseline.version}','app_current_baseline');`,
  );
  for (const item of chain.forwardTail) {
    psql(DATABASE, readFileSync(resolve(ROOT, item.path), "utf8"));
    psql(
      DATABASE,
      `insert into supabase_migrations.schema_migrations(version,name) values ('${item.version}','${
        basename(item.path).replace(/^\d+_|\.sql$/g, "")
      }');`,
    );
  }

  const history = psql(
    DATABASE,
    "select version from supabase_migrations.schema_migrations order by version;",
  );
  assert(
    history === [
      chain.baseline.version,
      ...chain.forwardTail.map((item) => item.version),
    ].join("\n"),
    "history_not_coherent",
  );
  const subjectRefGuard = psql(DATABASE, subjectRefGuardProofSql());
  assert(
    subjectRefGuard === "1|10|1|1|0|1",
    `subject_ref_guard_failed:result=${subjectRefGuard}`,
  );
  const rebuiltCatalog = psql(DATABASE, catalogSql).split("\n").filter((line) =>
    line.includes("\t")
  );
  if (!FRESH_ONLY) {
    const activeCatalog = psql(
      ACTIVE_DATABASE,
      `begin read only; ${catalogSql} rollback;`,
    )
      .split("\n").filter((line) => line.includes("\t"));
    if (activeCatalog.join("\n") !== rebuiltCatalog.join("\n")) {
      const activeSet = new Set(activeCatalog);
      const rebuiltSet = new Set(rebuiltCatalog);
      const activeOnly = activeCatalog.filter((line) => !rebuiltSet.has(line))
        .slice(0, 3);
      const rebuiltOnly = rebuiltCatalog.filter((line) => !activeSet.has(line))
        .slice(0, 3);
      fail(
        `current_app_schema_parity_failed:active_only=${
          activeOnly.join(";")
        }:rebuilt_only=${rebuiltOnly.join(";")}`,
      );
    }
  }

  const empty = psql(
    DATABASE,
    `select concat_ws('|',
    (select count(*) from public.app_customers),
    (select count(*) from public.app_cases),
    (select count(*) from public.app_customer_access_grants),
    (select count(*) from public.app_signup_signature_evidence),
    (select count(*) from public.app_workforce_identities),
    (select count(*) from public.app_workforce_capability_catalog),
    (select count(*) from public.app_workforce_policy_versions),
    (select count(*) from public.app_workforce_policy_requirements),
    (select count(*) from public.app_workforce_policy_activations),
    (select count(*) from public.app_evidence_review_decisions),
    (select count(*) from public.app_evidence_review_correction_handoffs),
    (select count(*) from public.app_customer_correction_replacement_uploads),
    (select count(*) from public.app_customer_correction_replacement_candidates),
    (select count(*) from public.app_customer_correction_replacement_candidate_events),
    (select count(*) from public.app_evidence_review_customer_submission_replacements)
  );`,
  );
  assert(
    empty === "0|0|0|0|0|16|7|88|7|0|0|0|0|0|0",
    "fresh_data_boundary_failed",
  );
  const informationRequestPolicySeed = psql(
    DATABASE,
    `select concat_ws('|',
      (select count(*) from public.app_workforce_capability_catalog
        where capability_code='customer.information_request.manage'
          and catalogue_version='pilot_v1'
          and floor_seniority='reviewer'
          and default_seniority='reviewer'
          and scope_kind='case'),
      (select count(*) from public.app_workforce_policy_versions
        where id='00000000-0000-4000-8000-000000003601'
          and policy_ref='enval_default_v7'
          and catalogue_version='pilot_v1'
          and require_distinct_maker_checker
          and canonical_sha256=pg_catalog.encode(extensions.digest(
            'customer_information_request_v1|enval_default_v7|customer.information_request.manage=reviewer',
            'sha256'
          ), 'hex')
          and created_by_workforce_identity_id is null
          and created_by_actor_ref='system:customer_information_request_v1_migration'
          and decision_ref='customer_information_request_v1_default_policy'
          and request_id='customer-information-request-v1-default-policy-v7'),
      (select count(*) from public.app_workforce_policy_requirements
        where policy_version_id='00000000-0000-4000-8000-000000003601'),
      (select count(*)
        from public.app_workforce_policy_requirements requirement
        join public.app_workforce_capability_catalog capability
          on capability.capability_code=requirement.capability_code
         and capability.catalogue_version='pilot_v1'
         and capability.default_seniority=requirement.minimum_seniority
        where requirement.policy_version_id='00000000-0000-4000-8000-000000003601'),
      (select count(*) from public.app_workforce_policy_requirements
        where policy_version_id='00000000-0000-4000-8000-000000003601'
          and capability_code='customer.information_request.manage'
          and minimum_seniority='reviewer'),
      (select count(*) from public.app_workforce_policy_activations
        where id='00000000-0000-4000-8000-000000003602'
          and policy_version_id='00000000-0000-4000-8000-000000003601'
          and effective_at=recorded_at
          and activated_by_workforce_identity_id is null
          and activated_by_actor_ref='system:customer_information_request_v1_migration'
          and decision_ref='customer_information_request_v1_default_policy'
          and request_id='customer-information-request-v1-default-policy-activation-v7'),
      (select count(*) from public.app_workforce_policy_activations activation
        where activation.id='00000000-0000-4000-8000-000000003602'
          and not exists (
            select 1 from public.app_workforce_policy_activations later
            where later.effective_at > activation.effective_at
               or (
                 later.effective_at = activation.effective_at
                 and later.recorded_at > activation.recorded_at
               )
          ))
    );`,
  ).split("|");
  assert(
    informationRequestPolicySeed[0] === "1",
    "information_request_capability_not_exact",
  );
  assert(
    informationRequestPolicySeed[1] === "1",
    "information_request_policy_version_not_exact",
  );
  assert(
    informationRequestPolicySeed[2] === "16" &&
      informationRequestPolicySeed[3] === "16" &&
      informationRequestPolicySeed[4] === "1",
    "information_request_policy_requirements_not_exact",
  );
  assert(
    informationRequestPolicySeed[5] === "1" &&
      informationRequestPolicySeed[6] === "1",
    "information_request_policy_activation_not_exact",
  );
  const security = psql(
    DATABASE,
    `select (
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname like 'app\\_%') = 89
    and (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname like 'app\\_%' and c.relrowsecurity) = 89
    and not exists (select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name like 'app\\_%'
        and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))
    and not has_table_privilege('service_role','public.app_customer_access_grants','INSERT')
    and has_table_privilege('service_role','public.app_customer_access_grants','SELECT')
    and has_function_privilege('service_role','public.app_bootstrap_customer_auth_v7(uuid,text,text,text,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_bootstrap_customer_auth_v7(uuid,text,text,text,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_bootstrap_customer_auth_v7(uuid,text,text,text,text,text,text,text,text,text)','EXECUTE')
    and not has_table_privilege('service_role','public.app_workforce_identities','INSERT')
    and not has_table_privilege('service_role','public.app_evidence_review_decisions','INSERT')
    and has_table_privilege('service_role','public.app_evidence_review_decisions','SELECT')
    and not has_table_privilege('service_role','public.app_evidence_review_rounds','SELECT')
    and not has_table_privilege('service_role','public.app_evidence_review_rounds','INSERT')
    and not has_table_privilege('service_role','public.app_evidence_review_round_subject_decisions','SELECT')
    and not has_table_privilege('service_role','public.app_evidence_review_round_subject_decisions','INSERT')
    and not has_table_privilege('service_role','public.app_evidence_review_correction_handoffs','SELECT')
    and not has_table_privilege('service_role','public.app_evidence_review_correction_handoffs','INSERT')
    and not has_table_privilege('service_role','public.app_customer_correction_replacement_uploads','SELECT')
    and not has_table_privilege('service_role','public.app_customer_correction_replacement_uploads','INSERT')
    and has_table_privilege('service_role','public.app_customer_correction_replacement_candidates','SELECT')
    and not has_table_privilege('service_role','public.app_customer_correction_replacement_candidates','INSERT')
    and has_table_privilege('service_role','public.app_customer_correction_replacement_candidate_events','SELECT')
    and not has_table_privilege('service_role','public.app_customer_correction_replacement_candidate_events','INSERT')
    and not has_table_privilege('service_role','public.app_evidence_review_customer_submission_replacements','SELECT')
    and not has_table_privilege('service_role','public.app_customer_correction_fact_resolution_challenge_bindings','SELECT')
    and has_table_privilege('service_role','public.app_evidence_review_customer_submission_fact_resolutions','SELECT')
    and not has_table_privilege('service_role','public.app_evidence_review_customer_submission_fact_resolutions','INSERT')
    and has_table_privilege('service_role','public.app_evidence_review_customer_submission_fact_resolution_sources','SELECT')
    and not has_table_privilege('service_role','public.app_evidence_review_customer_submission_fact_resolution_sources','INSERT')
    and has_table_privilege('service_role','public.app_tenant_configuration_component_revisions','SELECT')
    and has_table_privilege('service_role','public.app_tenant_configuration_component_revisions','INSERT')
    and not has_table_privilege('service_role','public.app_tenant_configuration_component_revisions','UPDATE')
    and not has_table_privilege('service_role','public.app_tenant_configuration_component_revisions','DELETE')
    and has_table_privilege('service_role','public.app_tenant_configuration_manifests','SELECT')
    and has_table_privilege('service_role','public.app_tenant_configuration_manifests','INSERT')
    and not has_table_privilege('service_role','public.app_tenant_configuration_manifests','UPDATE')
    and not has_table_privilege('service_role','public.app_tenant_configuration_manifests','DELETE')
    and has_table_privilege('service_role','public.app_signup_signing_presentation_receipts','SELECT')
    and has_table_privilege('service_role','public.app_signup_signing_presentation_receipts','INSERT')
    and not has_table_privilege('service_role','public.app_signup_signing_presentation_receipts','UPDATE')
    and not has_table_privilege('service_role','public.app_signup_signing_presentation_receipts','DELETE')
    and has_table_privilege('service_role','public.app_signup_signing_presentation_acceptances','SELECT')
    and not has_table_privilege('service_role','public.app_signup_signing_presentation_acceptances','INSERT')
    and not has_table_privilege('service_role','public.app_signup_signing_presentation_acceptances','UPDATE')
    and not has_table_privilege('service_role','public.app_signup_signing_presentation_acceptances','DELETE')
    and not has_table_privilege('service_role','public.app_workflow_email_intents','SELECT')
    and not has_table_privilege('service_role','public.app_workflow_email_deliveries','SELECT')
    and not has_table_privilege('service_role','public.app_workflow_email_delivery_attempts','SELECT')
    and not has_table_privilege('service_role','public.app_workflow_email_dispatches','SELECT')
    and not has_function_privilege('service_role','public.app_workflow_email_enqueue_v1(text,text,text,text,uuid,text,jsonb,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_workflow_email_cancel_v1(text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_information_request_email_notify_v1(text,uuid,text,text,jsonb)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_information_request_create_v1(uuid,text,text,text,text,text,timestamptz,jsonb)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_information_request_respond_v1(uuid,text,text,text,text,text,text,timestamptz,jsonb)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_information_request_transition_v1(uuid,text,text,text,text,text,text,timestamptz,jsonb)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_information_request_create_v1(uuid,text,text,text,text,text,timestamptz,jsonb)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_information_request_respond_v1(uuid,text,text,text,text,text,text,timestamptz,jsonb)','EXECUTE')
    and has_function_privilege('service_role','public.app_workflow_email_claim_v1()','EXECUTE')
    and has_function_privilege('service_role','public.app_workflow_email_complete_v1(uuid,uuid,text,text,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_workflow_email_claim_v1()','EXECUTE')
    and not has_function_privilege('authenticated','public.app_workflow_email_complete_v1(uuid,uuid,text,text,text)','EXECUTE')
  )::text;`,
  );
  assert(security === "true", "rls_privilege_parity_failed");
  const foundations = psql(
    DATABASE,
    `select (
    to_regclass('public.app_customers') is not null
    and to_regclass('public.app_cases') is not null
    and to_regclass('public.app_customer_access_grants') is not null
    and to_regprocedure('public.app_bootstrap_customer_auth_v7(uuid,text,text,text,text,text,text,text,text,text)') is not null
    and to_regclass('public.app_signup_signing_challenges') is not null
    and to_regclass('public.app_signup_signing_presentation_receipts') is not null
    and to_regclass('public.app_signup_signing_presentation_acceptances') is not null
    and to_regclass('public.app_signup_signature_evidence') is not null
    and to_regprocedure('public.app_signup_signing_finalize_v2(uuid,text,uuid,text,text,text,jsonb,text,jsonb,uuid[],text,integer,timestamptz,jsonb,text,text,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_workforce_authorize_v1(uuid,text,uuid,uuid,timestamptz)') is not null
    and to_regprocedure('public.app_workforce_authorize_v1(uuid,text,text,uuid,uuid,timestamptz)') is not null
    and to_regclass('public.app_workforce_tenant_scope_assignments') is not null
    and to_regclass('public.app_delivery_year_compliance_source_events') is not null
    and (select count(*) from public.app_delivery_year_compliance_source_events) = 0
    and to_regclass('public.app_evidence_review_decisions') is not null
    and (select count(*) from public.app_evidence_review_decisions) = 0
    and to_regprocedure('public.app_evidence_review_decide_v1(uuid,uuid,text,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_evidence_review_decide_v2(uuid,uuid,text,text,text,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_evidence_review_case_detail_read_v2(uuid,text)') is not null
    and to_regprocedure('public.app_evidence_review_case_detail_read_v3(uuid,text)') is not null
    and to_regprocedure('public.app_evidence_review_case_detail_read_v4(uuid,text)') is not null
    and to_regprocedure('public.app_evidence_review_case_detail_read_v5(uuid,text)') is not null
    and to_regprocedure('public.app_evidence_review_case_detail_read_v6(uuid,text)') is not null
    and to_regprocedure('public.app_evidence_review_case_detail_read_v7(uuid,text)') is not null
    and to_regprocedure('public.app_evidence_review_overall_status_v1(uuid,text,text)') is not null
    and to_regprocedure('public.app_evidence_review_round_finalize_v1(uuid,text,text,text,jsonb,text,text,text,timestamptz)') is not null
    and to_regclass('public.app_evidence_review_correction_handoffs') is not null
    and to_regclass('public.app_customer_correction_replacement_uploads') is not null
    and to_regclass('public.app_customer_correction_replacement_candidates') is not null
    and to_regclass('public.app_customer_correction_replacement_candidate_events') is not null
    and to_regclass('public.app_evidence_review_customer_submissions') is not null
    and to_regclass('public.app_evidence_review_customer_submission_items') is not null
    and to_regclass('public.app_evidence_review_customer_submission_replacements') is not null
    and to_regclass('public.app_evidence_review_decision_carry_forwards') is not null
    and to_regclass('public.app_customer_correction_signer_challenge_bindings') is not null
    and to_regclass('public.app_customer_correction_signer_evidence_bindings') is not null
    and to_regclass('public.app_customer_correction_fact_resolution_challenge_bindings') is not null
    and to_regclass('public.app_evidence_review_customer_submission_fact_resolutions') is not null
    and to_regclass('public.app_evidence_review_customer_submission_fact_resolution_sources') is not null
    and to_regprocedure('public.app_customer_correction_challenge_issue_v1(uuid,text,jsonb,text,text,timestamptz,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_challenge_issue_v2(uuid,text,jsonb,text,text,timestamptz,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_challenge_issue_v3(uuid,text,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_challenge_issue_v4(uuid,text,jsonb,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_challenge_issue_v5(uuid,text,jsonb,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_finalize_v1(uuid,text,uuid,text,text,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_finalize_v2(uuid,text,uuid,text,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_finalize_v3(uuid,text,uuid,text,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_finalize_v4(uuid,text,uuid,text,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_evidence_review_correction_publish_v2(uuid,text,uuid,text,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_evidence_review_correction_publish_v3(uuid,text,uuid,jsonb,text,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_evidence_review_correction_publish_guarded_inner_v1(uuid,text,uuid,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_customer_information_request_history_projection_v1(uuid,uuid)') is not null
    and to_regprocedure('public.app_customer_information_request_customer_read_v1(uuid,text)') is not null
    and to_regprocedure('public.app_customer_information_request_workforce_read_v1(uuid,text)') is not null
    and to_regclass('public.app_workflow_email_intents') is not null
    and to_regclass('public.app_workflow_email_deliveries') is not null
    and to_regclass('public.app_workflow_email_delivery_attempts') is not null
    and to_regclass('public.app_workflow_email_dispatches') is not null
    and to_regprocedure('public.app_workflow_email_enqueue_v1(text,text,text,text,uuid,text,jsonb,text)') is not null
    and to_regprocedure('public.app_workflow_email_claim_v1()') is not null
    and to_regprocedure('public.app_workflow_email_complete_v1(uuid,uuid,text,text,text)') is not null
    and to_regprocedure('public.app_customer_information_request_email_notify_v1(text,uuid,text,text,jsonb)') is not null
    and to_regprocedure('public.app_customer_information_request_create_v1(uuid,text,text,text,text,text,timestamptz,jsonb)') is not null
    and to_regprocedure('public.app_customer_information_request_respond_v1(uuid,text,text,text,text,text,text,timestamptz,jsonb)') is not null
    and to_regprocedure('public.app_customer_information_request_transition_v1(uuid,text,text,text,text,text,text,timestamptz,jsonb)') is not null
    and not has_function_privilege('service_role','public.app_customer_information_request_projection_v1(uuid)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_information_request_projection_v1(uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_information_request_projection_v1(uuid)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_information_request_history_projection_v1(uuid,uuid)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_information_request_history_projection_v1(uuid,uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_information_request_history_projection_v1(uuid,uuid)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_information_request_customer_read_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_information_request_workforce_read_v1(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_information_request_customer_read_v1(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_information_request_workforce_read_v1(uuid,text)','EXECUTE')
    and position('limit 50' in lower(pg_get_functiondef('public.app_customer_information_request_history_projection_v1(uuid,uuid)'::regprocedure))) > 0
    and position('created_at desc' in lower(pg_get_functiondef('public.app_customer_information_request_history_projection_v1(uuid,uuid)'::regprocedure))) > 0
    and position('request_reference desc' in lower(pg_get_functiondef('public.app_customer_information_request_history_projection_v1(uuid,uuid)'::regprocedure))) > 0
    and position('''terminal_at'', history.terminal_at' in lower(pg_get_functiondef('public.app_customer_information_request_history_projection_v1(uuid,uuid)'::regprocedure))) > 0
    and position('updated_at' in lower(pg_get_functiondef('public.app_customer_information_request_history_projection_v1(uuid,uuid)'::regprocedure))) = 0
    and position('''terminal_at'', information_request.terminal_at' in lower(pg_get_functiondef('public.app_customer_information_request_projection_v1(uuid)'::regprocedure))) > 0
    and position('updated_at' in lower(pg_get_functiondef('public.app_customer_information_request_projection_v1(uuid)'::regprocedure))) = 0
    and position('app_customer_information_request_history_projection_v1' in pg_get_functiondef('public.app_customer_information_request_customer_read_v1(uuid,text)'::regprocedure)) > 0
    and position('app_customer_information_request_history_projection_v1' in pg_get_functiondef('public.app_customer_information_request_workforce_read_v1(uuid,text)'::regprocedure)) > 0
    and to_regprocedure('public.app_evidence_review_current_correction_handoff_v1(uuid,text,text)') is not null
    and to_regprocedure('public.app_evidence_review_correction_supersede_v1(uuid,text,text,jsonb,text,text,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_evidence_review_correction_supersede_v2(uuid,text,text,jsonb,text,text,text,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_evidence_review_correction_supersede_v3(uuid,text,text,jsonb,text,text,text,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_targets_v1(uuid)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_authority_v1(uuid,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_upload_issue_v1(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_upload_resolve_v1(uuid,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_upload_confirm_v1(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_upload_issue_v2(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_upload_resolve_v2(uuid,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_upload_confirm_v2(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_resolution_v1(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_resolution_v2(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_withdraw_v1(uuid,text,text,text,text,text,text,timestamptz,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_withdraw_v2(uuid,text,text,text,text,text,text,timestamptz,text)') is not null
    and to_regprocedure('public.app_customer_correction_handoff_read_v7(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_handoff_read_v8(uuid,text)') is not null
    and position('handoff.target_customer_id = v_submission.customer_id' in pg_get_functiondef('public.app_customer_correction_safe_projection_v2(uuid,text)'::regprocedure)) > 0
    and position('handoff.customer_id = v_submission.customer_id' in pg_get_functiondef('public.app_customer_correction_safe_projection_v2(uuid,text)'::regprocedure)) = 0
    and position('access_grant.customer_id <> v_case.customer_id' in pg_get_functiondef('public.app_evidence_review_correction_publish_guarded_inner_v1(uuid,text,uuid,text,text,text,timestamptz)'::regprocedure)) > 0
    and position('access_grant.customer_id = v_case.customer_id' in pg_get_functiondef('public.app_evidence_review_correction_publish_guarded_inner_v1(uuid,text,uuid,text,text,text,timestamptz)'::regprocedure)) = 0
    and position('app_workforce_authorize_v1' in pg_get_functiondef('public.app_evidence_review_correction_publish_v2(uuid,text,uuid,text,text,text,text,timestamptz)'::regprocedure)) > 0
    and position('app_customer_information_requests' in pg_get_functiondef('public.app_evidence_review_correction_publish_v2(uuid,text,uuid,text,text,text,text,timestamptz)'::regprocedure)) > 0
    and position('customer_publication' in pg_get_functiondef('public.app_evidence_review_correction_publish_v2(uuid,text,uuid,text,text,text,text,timestamptz)'::regprocedure)) > 0
    and to_regprocedure('public.app_customer_correction_handoff_read_v1(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_handoff_read_v2(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_handoff_read_v3(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_handoff_read_v4(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_handoff_read_v5(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_handoff_read_v6(uuid,text)') is not null
    and to_regprocedure('public.app_correction_customer_publication_snapshot_v1(uuid)') is not null
    and to_regprocedure('public.app_customer_correction_signer_context_v1(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_item_ref_v1(uuid,uuid,uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_prepare_v2(uuid,text,jsonb)') is not null
    and to_regprocedure('public.app_evidence_review_state_v1(uuid,uuid)') is not null
    and not has_function_privilege('service_role','public.app_evidence_review_decide_v1(uuid,uuid,text,text,text,text,timestamptz)','EXECUTE')
    and has_function_privilege('service_role','public.app_evidence_review_decide_v2(uuid,uuid,text,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_decide_v2(uuid,uuid,text,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_case_detail_read_v2(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_case_detail_read_v3(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_case_detail_read_v4(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_case_detail_read_v5(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_case_detail_read_v6(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_evidence_review_case_detail_read_v7(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_case_detail_read_v7(uuid,text)','EXECUTE')
    and position('app_workforce_authorize_v1' in pg_get_functiondef('public.app_evidence_review_case_detail_read_v7(uuid,text)'::regprocedure)) > 0
    and position('evidence.review.correction.publish' in pg_get_functiondef('public.app_evidence_review_case_detail_read_v7(uuid,text)'::regprocedure)) > 0
    and not has_function_privilege('service_role','public.app_evidence_review_overall_status_v1(uuid,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_evidence_review_round_finalize_v1(uuid,text,text,text,jsonb,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_round_finalize_v1(uuid,text,text,text,jsonb,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_correction_publish_v2(uuid,text,uuid,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_correction_publish_v2(uuid,text,uuid,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_correction_publish_guarded_inner_v1(uuid,text,uuid,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_correction_supersede_v1(uuid,text,text,jsonb,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_correction_supersede_v1(uuid,text,text,jsonb,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_correction_supersede_v2(uuid,text,text,jsonb,text,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_correction_supersede_v2(uuid,text,text,jsonb,text,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_replacement_targets_v1(uuid)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_replacement_authority_v1(uuid,text,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_replacement_upload_issue_v1(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_upload_issue_v1(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_replacement_upload_resolve_v1(uuid,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_upload_resolve_v1(uuid,text,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_replacement_upload_confirm_v1(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_upload_confirm_v1(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_resolution_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_resolution_v1(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_resolution_v2(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_resolution_v2(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_replacement_withdraw_v1(uuid,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_withdraw_v1(uuid,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_current_correction_handoff_v1(uuid,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v1(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v2(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v2(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v3(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v3(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v4(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v4(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v5(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v5(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v6(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v6(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_correction_customer_publication_snapshot_v1(uuid)','EXECUTE')
    and not has_function_privilege('anon','public.app_correction_customer_publication_snapshot_v1(uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_correction_customer_publication_snapshot_v1(uuid)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_signer_context_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_signer_context_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_challenge_issue_v2(uuid,text,jsonb,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_challenge_issue_v1(uuid,text,jsonb,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_challenge_issue_v2(uuid,text,jsonb,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_challenge_issue_v3(uuid,text,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_challenge_issue_v3(uuid,text,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_challenge_issue_v4(uuid,text,jsonb,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_challenge_issue_v4(uuid,text,jsonb,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_finalize_v1(uuid,text,uuid,text,text,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_finalize_v2(uuid,text,uuid,text,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_finalize_v2(uuid,text,uuid,text,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_finalize_v3(uuid,text,uuid,text,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_finalize_v3(uuid,text,uuid,text,text,text,text,text,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_evidence_review_correction_publish_v3(uuid,text,uuid,jsonb,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_correction_publish_v3(uuid,text,uuid,jsonb,text,text,text,text,timestamptz)','EXECUTE')
    and has_function_privilege('service_role','public.app_evidence_review_correction_supersede_v3(uuid,text,text,jsonb,text,text,text,text,text,text,timestamptz)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_challenge_issue_v5(uuid,text,jsonb,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_finalize_v4(uuid,text,uuid,text,text,text,text,text,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v7(uuid,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_correction_handoff_read_v7(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v7(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v8(uuid,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_correction_handoff_read_v8(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v8(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_safe_projection_v2(uuid,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_correction_safe_projection_v2(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_safe_projection_v2(uuid,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_correction_safe_projection_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_safe_projection_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_safe_projection_v1(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_upload_issue_v2(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_correction_replacement_upload_issue_v2(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_upload_issue_v2(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_upload_resolve_v2(uuid,text,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_correction_replacement_upload_resolve_v2(uuid,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_upload_resolve_v2(uuid,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_upload_confirm_v2(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_correction_replacement_upload_confirm_v2(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_upload_confirm_v2(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_withdraw_v2(uuid,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('anon','public.app_customer_correction_replacement_withdraw_v2(uuid,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_withdraw_v2(uuid,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_item_ref_v1(uuid,uuid,uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_prepare_v2(uuid,text,jsonb)','EXECUTE')
    and not has_function_privilege('service_role','public.app_workforce_authorize_v1(uuid,text,uuid,uuid,timestamptz)','EXECUTE')
    and to_regprocedure('public.app_compliance_source_event_capture_v1(uuid,text,text,text,timestamptz,jsonb)') is not null
    and has_function_privilege('service_role','public.app_compliance_source_event_capture_v1(uuid,text,text,text,timestamptz,jsonb)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_compliance_source_event_capture_v1(uuid,text,text,text,timestamptz,jsonb)','EXECUTE')
    and to_regprocedure('public.app_compliance_worklist_source_events_read_v1(uuid,integer)') is not null
    and has_function_privilege('service_role','public.app_compliance_worklist_source_events_read_v1(uuid,integer)','EXECUTE')
    and not has_function_privilege('anon','public.app_compliance_worklist_source_events_read_v1(uuid,integer)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_compliance_worklist_source_events_read_v1(uuid,integer)','EXECUTE')
    and has_function_privilege('service_role','public.app_evidence_review_worklist_source_read_v1(uuid)','EXECUTE')
    and not has_function_privilege('anon','public.app_evidence_review_worklist_source_read_v1(uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_worklist_source_read_v1(uuid)','EXECUTE')
    and to_regprocedure('public.app_evidence_review_worklist_source_read_v3(uuid)') is not null
    and to_regprocedure('public.app_evidence_review_worklist_source_read_v4(uuid)') is not null
    and not has_function_privilege('service_role','public.app_evidence_review_worklist_source_read_v2(uuid)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_worklist_source_read_v3(uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_worklist_source_read_v3(uuid)','EXECUTE')
    and has_function_privilege('service_role','public.app_evidence_review_worklist_source_read_v4(uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_worklist_source_read_v4(uuid)','EXECUTE')
    and not has_function_privilege('service_role','public.app_workforce_authorize_v1(uuid,text,text,uuid,uuid,timestamptz)','EXECUTE')
    and position('app_workforce_authorize_v1' in pg_get_functiondef('public.app_compliance_worklist_source_events_read_v1(uuid,integer)'::regprocedure)) > 0
    and position('app_workforce_authorize_v1' in pg_get_functiondef('public.app_evidence_review_worklist_source_read_v1(uuid)'::regprocedure)) > 0
    and to_regprocedure('public.app_ops_location_authorization_resolve_v1(uuid,text,uuid,uuid,timestamptz)') is not null
    and position('app_workforce_authorize_v1' in pg_get_functiondef('public.app_ops_location_authorization_resolve_v1(uuid,text,uuid,uuid,timestamptz)'::regprocedure)) > 0
  )::text;`,
  );
  assert(foundations === "true", "behavioral_foundations_missing");
  const bootstrapOutput = psql(
    DATABASE,
    `begin;
    insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    values ('91000000-0000-4000-8000-000000000001','proof@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp());
    select (public.app_workforce_first_admin_bootstrap_v1(
      '91000000-0000-4000-8000-000000000001','local','enval','mig02-proof',
      'mig02-proof','${"a".repeat(64)}','2030-01-01T00:00:00Z','mig02-proof'
    )->>'ok')::boolean;
    select bool_and((public.app_workforce_authorize_v1(
      '91000000-0000-4000-8000-000000000001',capability,null,null,clock_timestamp()
    )->>'ok')::boolean) from (values ('case.assignment.manage'),('workforce.member.manage'),('workforce.policy.manage')) caps(capability);
    select (public.app_workforce_authorize_v1(
      '91000000-0000-4000-8000-000000000001',
      'compliance.delivery_year.view','CURRENT_TENANT_DATA_PLANE',
      null,null,clock_timestamp()
    )->>'ok')::boolean;
    rollback;`,
  );
  const bootstrap = bootstrapOutput.split("\n").filter((line) => line === "t");
  assert(
    bootstrap.length === 3,
    `central_policy_behavior_failed:result=${bootstrapOutput}`,
  );
  assert(
    psql(DATABASE, "select count(*) from public.app_workforce_identities;") ===
      "0",
    "fresh_workforce_not_zero",
  );
  proveTerminalProjectionGuard(DATABASE);

  console.log("MIG02_CHAIN_PROOF=PASS");
  console.log("DISPOSABLE_REBUILD=PASS");
  console.log(
    FRESH_ONLY
      ? "CURRENT_APP_SCHEMA_PARITY=SKIPPED_FRESH_ONLY"
      : "CURRENT_APP_SCHEMA_PARITY=PASS",
  );
  console.log("SUBJECT_REF_GUARD_HERMETIC=PASS");
  console.log("SUBJECT_REF_NEGATIVE_ZERO_WRITE=PASS");
  console.log("RLS_PRIVILEGE_PARITY=PASS");
  console.log("BEHAVIORAL_PARITY=PASS");
  console.log("TERMINAL_PROJECTION_JSON_NULL=PASS");
  console.log("TERMINAL_PROJECTION_MALFORMED_FAIL_CLOSED=PASS");
  console.log("FRESH_WORKFORCE_COUNT=0");
  console.log("ARCHIVED_LEGACY_CANNOT_EXECUTE=PASS");
  console.log(
    `CURRENT_PRESENT_APP_MIGRATIONS=${
      chain.currentPresentAppMigrations.map((item) =>
        `${item.version}_${item.name}`
      ).join(",")
    }`,
  );
  console.log(
    `ABSENT_LEGACY_MIGRATIONS=${
      chain.absentLegacyMigrations.map((item) => `${item.version}_${item.name}`)
        .join(",")
    }`,
  );
  console.log(
    `EXCLUDED_CONNECTION_MIGRATIONS=${
      chain.excludedConnectionMigrations.map((item) =>
        `${item.version}_${item.name}`
      ).join(",")
    }`,
  );
  console.log(
    `CURRENT_TAIL=${
      chain.forwardTail.map((item) => basename(item.path)).join(",")
    }`,
  );
  console.log(
    `ACTIVE_CHAIN=${
      [chain.baseline, ...chain.forwardTail].map((item) => basename(item.path))
        .join(",")
    }`,
  );
} catch (error) {
  console.error(
    `MIG02_CHAIN_PROOF=FAIL\n${
      scrub(error instanceof Error ? error.message : error)
    }`,
  );
  process.exitCode = 1;
} finally {
  try {
    docker(["dropdb", "-U", "postgres", "--force", "--if-exists", DATABASE]);
  } catch {}
  if (!FRESH_ONLY) {
    const after = activeFingerprint();
    if (before !== after) {
      console.error("ACTIVE_DATABASE_UNCHANGED=FAIL");
      process.exitCode = 1;
    } else if (!process.exitCode) {
      console.log("ACTIVE_DATABASE_UNCHANGED=PASS");
      console.log("FIRST_ADMIN_STATE_UNCHANGED=PASS");
    }
  }
}
