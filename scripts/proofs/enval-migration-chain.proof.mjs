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

const target = resolveSupabaseTarget({
  target: "TENANT_ENVAL",
  operation: "inspect",
  cwd: ROOT,
});
assert(target.localOnly && target.projectId === "enval", "target_guard_failed");
const before = activeFingerprint();
assert(before, "active_fingerprint_missing");

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
  const activeCatalog = psql(
    ACTIVE_DATABASE,
    `begin read only; ${catalogSql} rollback;`,
  )
    .split("\n").filter((line) => line.includes("\t"));
  const rebuiltCatalog = psql(DATABASE, catalogSql).split("\n").filter((line) =>
    line.includes("\t")
  );
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
    (select count(*) from public.app_evidence_review_customer_submission_replacements)
  );`,
  );
  assert(
    empty === "0|0|0|0|0|15|6|72|6|0|0|0|0|0",
    "fresh_data_boundary_failed",
  );
  const security = psql(
    DATABASE,
    `select (
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname like 'app\\_%') = 70
    and (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname like 'app\\_%' and c.relrowsecurity) = 70
    and not exists (select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name like 'app\\_%'
        and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))
    and not has_table_privilege('service_role','public.app_customer_access_grants','INSERT')
    and has_table_privilege('service_role','public.app_customer_access_grants','SELECT')
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
    and not has_table_privilege('service_role','public.app_evidence_review_customer_submission_replacements','SELECT')
  )::text;`,
  );
  assert(security === "true", "rls_privilege_parity_failed");
  const foundations = psql(
    DATABASE,
    `select (
    to_regclass('public.app_customers') is not null
    and to_regclass('public.app_cases') is not null
    and to_regclass('public.app_customer_access_grants') is not null
    and to_regclass('public.app_signup_signing_challenges') is not null
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
    and to_regclass('public.app_evidence_review_customer_submissions') is not null
    and to_regclass('public.app_evidence_review_customer_submission_items') is not null
    and to_regclass('public.app_evidence_review_customer_submission_replacements') is not null
    and to_regclass('public.app_evidence_review_decision_carry_forwards') is not null
    and to_regclass('public.app_customer_correction_signer_challenge_bindings') is not null
    and to_regclass('public.app_customer_correction_signer_evidence_bindings') is not null
    and to_regprocedure('public.app_customer_correction_challenge_issue_v1(uuid,text,jsonb,text,text,timestamptz,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_challenge_issue_v2(uuid,text,jsonb,text,text,timestamptz,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_challenge_issue_v3(uuid,text,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_finalize_v1(uuid,text,uuid,text,text,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_finalize_v2(uuid,text,uuid,text,text,text,text,text,text,text)') is not null
    and to_regprocedure('public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_evidence_review_current_correction_handoff_v1(uuid,text,text)') is not null
    and to_regprocedure('public.app_evidence_review_correction_supersede_v1(uuid,text,text,jsonb,text,text,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_targets_v1(uuid)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_authority_v1(uuid,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_upload_issue_v1(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_upload_resolve_v1(uuid,text,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_upload_confirm_v1(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)') is not null
    and to_regprocedure('public.app_customer_correction_replacement_resolution_v1(uuid,text)') is not null
    and position('access_grant.customer_id <> v_case.customer_id' in pg_get_functiondef('public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)'::regprocedure)) > 0
    and position('access_grant.customer_id = v_case.customer_id' in pg_get_functiondef('public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)'::regprocedure)) = 0
    and to_regprocedure('public.app_customer_correction_handoff_read_v1(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_handoff_read_v2(uuid,text)') is not null
    and to_regprocedure('public.app_customer_correction_handoff_read_v3(uuid,text)') is not null
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
    and has_function_privilege('service_role','public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)','EXECUTE')
    and has_function_privilege('service_role','public.app_evidence_review_correction_supersede_v1(uuid,text,text,jsonb,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_evidence_review_correction_supersede_v1(uuid,text,text,jsonb,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_replacement_targets_v1(uuid)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_replacement_authority_v1(uuid,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_upload_issue_v1(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_upload_issue_v1(uuid,text,text,text,text,bigint,timestamptz,text,text,text,timestamptz,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_upload_resolve_v1(uuid,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_upload_resolve_v1(uuid,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_upload_confirm_v1(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_upload_confirm_v1(uuid,text,text,bigint,text,text,text,text,text,text,timestamptz,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_replacement_resolution_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_replacement_resolution_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_evidence_review_current_correction_handoff_v1(uuid,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v1(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v2(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v2(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_handoff_read_v3(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v3(uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_signer_context_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_signer_context_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_challenge_issue_v2(uuid,text,jsonb,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_challenge_issue_v2(uuid,text,jsonb,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_challenge_issue_v3(uuid,text,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_challenge_issue_v3(uuid,text,jsonb,text,text,text,timestamptz,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('service_role','public.app_customer_correction_finalize_v1(uuid,text,uuid,text,text,text,text,text,text,text,text)','EXECUTE')
    and has_function_privilege('service_role','public.app_customer_correction_finalize_v2(uuid,text,uuid,text,text,text,text,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.app_customer_correction_finalize_v2(uuid,text,uuid,text,text,text,text,text,text,text)','EXECUTE')
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

  console.log("MIG02_CHAIN_PROOF=PASS");
  console.log("DISPOSABLE_REBUILD=PASS");
  console.log("CURRENT_APP_SCHEMA_PARITY=PASS");
  console.log("RLS_PRIVILEGE_PARITY=PASS");
  console.log("BEHAVIORAL_PARITY=PASS");
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
  const after = activeFingerprint();
  if (before !== after) {
    console.error("ACTIVE_DATABASE_UNCHANGED=FAIL");
    process.exitCode = 1;
  } else if (!process.exitCode) {
    console.log("ACTIVE_DATABASE_UNCHANGED=PASS");
    console.log("FIRST_ADMIN_STATE_UNCHANGED=PASS");
  }
}
