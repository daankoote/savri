#!/usr/bin/env node

// LOCAL_SERVICE proof: actual Kong/Edge -> Auth -> private finalizer RPC.
// It creates one isolated synthetic case/workforce fixture in TENANT_ENVAL,
// removes it in finally, and never submits the real pilot case.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const PILOT_CASE_REF = "CASE-7E4CC75CD19F";
const HASH = "a".repeat(64);

function assert(value, code) {
  if (!value) throw new Error(code);
}

function scrub(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s'\"<>]+/gi, "[database]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g, "[token]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, "[key]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replace(/[0-9a-f]{64}/gi, "[hash]")
    .replace(/\s+/g, " ")
    .slice(0, 600);
}

function parseEnvironment(raw) {
  const result = new Map();
  for (const line of String(raw).split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    result.set(match[1], value);
  }
  return result;
}

function localRuntime() {
  const raw = execFileSync(
    "supabase",
    ["--workdir", ROOT, "status", "-o", "env"],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    },
  );
  const env = parseEnvironment(raw);
  const apiUrl = env.get("API_URL") ?? "";
  const dbUrl = env.get("DB_URL") ?? "";
  const anonKey = env.get("ANON_KEY") ?? "";
  const serviceRoleKey = env.get("SERVICE_ROLE_KEY") ?? "";
  const mailpitUrl = env.get("MAILPIT_URL") ?? "";
  const api = new URL(apiUrl);
  const database = new URL(dbUrl);
  assert(
    api.protocol === "http:" && api.hostname === "127.0.0.1" &&
      api.port === "54321",
    "non_local_api_target",
  );
  assert(
    ["postgres:", "postgresql:"].includes(database.protocol) &&
      database.hostname === "127.0.0.1" && database.port === "54322",
    "non_local_database_target",
  );
  assert(anonKey && serviceRoleKey && mailpitUrl, "local_keys_missing");
  return Object.freeze({
    apiUrl: apiUrl.replace(/\/$/, ""),
    dbUrl,
    anonKey,
    serviceRoleKey,
    mailpitUrl: mailpitUrl.replace(/\/$/, ""),
  });
}

function psql(runtime, sql) {
  return execFileSync(
    "psql",
    [runtime.dbUrl, "-X", "-Atq", "-v", "ON_ERROR_STOP=1"],
    {
      cwd: ROOT,
      encoding: "utf8",
      input: sql,
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  ).trim();
}

async function jsonRequest(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("non_json_runtime_response");
  }
  return Object.freeze({ status: response.status, body });
}

async function createAuth(runtime, prefix) {
  const email = `${prefix}@example.test`;
  const password = `Aa1!${crypto.randomUUID()}x`;
  const headers = {
    apikey: runtime.serviceRoleKey,
    Authorization: `Bearer ${runtime.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const created = await jsonRequest(`${runtime.apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert(
    created.status === 200 && created.body?.id,
    "auth_fixture_create_failed",
  );
  const signedIn = await jsonRequest(
    `${runtime.apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: runtime.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  assert(
    signedIn.status === 200 && typeof signedIn.body?.access_token === "string",
    "auth_fixture_signin_failed",
  );
  return Object.freeze({
    userId: String(created.body.id),
    token: String(signedIn.body.access_token),
  });
}

async function deleteAuth(runtime, userId) {
  if (!userId) return;
  const response = await fetch(
    `${runtime.apiUrl}/auth/v1/admin/users/${userId}`,
    {
      method: "DELETE",
      headers: {
        apikey: runtime.serviceRoleKey,
        Authorization: `Bearer ${runtime.serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error("auth_fixture_cleanup_failed");
  }
}

function fixture(prefix, authUserId) {
  const uuid = () => crypto.randomUUID();
  return Object.freeze({
    prefix,
    authUserId,
    fixtureHash: authUserId.replaceAll("-", "").padEnd(64, "0"),
    customerIdentityId: uuid(),
    email: `${prefix}@example.test`,
    customerId: uuid(),
    intakeId: uuid(),
    caseId: uuid(),
    caseRef: `CASE-${
      crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()
    }`,
    partyId: uuid(),
    partyProfileId: uuid(),
    partyProfileDriftId: uuid(),
    relationshipId: uuid(),
    locationId: uuid(),
    chargerId: uuid(),
    promotionId: uuid(),
    snapshotId: uuid(),
    energyFileId: uuid(),
    invoiceFileId: uuid(),
    energyVersionId: uuid(),
    energyVersionV2Id: uuid(),
    invoiceVersionId: uuid(),
  });
}

function pilotState(runtime) {
  const value = psql(
    runtime,
    `begin read only;
    with pilot as (
      select id from public.app_cases where case_reference='${PILOT_CASE_REF}'
    )
    select concat_ws('|',
      (select count(*) from public.app_evidence_review_rounds r
       join pilot on pilot.id=r.case_id),
      (select count(*) from public.app_evidence_review_round_subject_decisions d
       join public.app_evidence_review_rounds r on r.id=d.round_id
       join pilot on pilot.id=r.case_id),
      (select count(*) from public.app_evidence_review_correction_handoffs h
       join pilot on pilot.id=h.case_id),
      (select count(*)
       from public.app_customer_correction_replacement_uploads upload
       join pilot on pilot.id=upload.case_id),
      (select count(*)
       from public.app_customer_correction_replacement_candidates candidate
       join pilot on pilot.id=candidate.case_id),
      (select count(*)
       from public.app_customer_correction_replacement_candidate_events event
       join pilot on pilot.id=event.case_id),
      (select count(*) from public.app_evidence_review_customer_submissions s
       join pilot on pilot.id=s.case_id),
      (select count(*) from public.app_signup_signing_challenges ch
       join public.app_evidence_review_correction_handoffs h
         on h.id=ch.correction_handoff_id
       join pilot on pilot.id=h.case_id
       where ch.subject_type='CUSTOMER_CORRECTION'),
      coalesce((select r.id::text from public.app_evidence_review_rounds r
       join pilot on pilot.id=r.case_id
       order by r.finalized_at desc,r.id desc limit 1),'NONE')
    ); rollback;`,
  );
  return value;
}

function relevantFingerprint(runtime) {
  return psql(
    runtime,
    `begin read only; select concat_ws('|',
    (select count(*) from public.app_customers),
    (select count(*) from public.app_cases),
    (select count(*) from public.app_case_lifecycle_events),
    (select count(*) from public.app_evidence_files),
    (select count(*) from public.app_evidence_versions),
    (select count(*) from public.app_evidence_review_rounds),
    (select count(*) from public.app_evidence_review_round_subject_decisions),
    (select count(*) from public.app_evidence_review_correction_handoffs),
    (select count(*) from public.app_customer_correction_replacement_uploads),
    (select count(*) from public.app_customer_correction_replacement_candidates),
    (select count(*)
      from public.app_customer_correction_replacement_candidate_events),
    (select count(*) from public.app_parser_observation_envelopes
      where source_kind='correction_replacement_candidate'),
    (select count(*) from public.app_evidence_review_customer_submissions),
    (select count(*) from public.app_evidence_review_customer_submission_items),
    (select count(*)
      from public.app_evidence_review_customer_submission_replacements),
    (select count(*) from public.app_evidence_review_decision_carry_forwards),
    (select count(*) from public.app_customer_correction_signer_challenge_bindings),
    (select count(*) from public.app_customer_correction_signer_evidence_bindings),
    (select count(*) from public.app_signup_signing_challenges
      where subject_type='CUSTOMER_CORRECTION'),
    (select count(*) from public.app_customer_access_grants),
    (select count(*) from public.app_customer_party_relationships),
    (select count(*) from public.app_parties),
    (select count(*) from public.app_party_person_versions),
    (select count(*) from public.app_workforce_identities),
    (select count(*) from public.app_workforce_scope_assignments),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  ); rollback;`,
  );
}

function setupFixture(runtime, f, seniority = "reviewer") {
  assert(
    ["member", "reviewer", "admin"].includes(seniority),
    "invalid_fixture_seniority",
  );
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  const adminId = psql(
    runtime,
    `begin read only;
    select identity_row.auth_user_id::text
    from public.app_workforce_identities identity_row
    join lateral (
      select state from public.app_workforce_identity_states state_event
      where state_event.workforce_identity_id=identity_row.id
        and state_event.effective_at <= clock_timestamp()
      order by state_event.effective_at desc,state_event.recorded_at desc limit 1
    ) state on state.state='active'
    join lateral (
      select seniority from public.app_workforce_seniority_assignments seniority_event
      where seniority_event.workforce_identity_id=identity_row.id
        and seniority_event.effective_at <= clock_timestamp()
      order by seniority_event.effective_at desc,seniority_event.recorded_at desc limit 1
    ) seniority on seniority.seniority='admin'
    order by identity_row.created_at,identity_row.id limit 1; rollback;`,
  );
  assert(/^[0-9a-f-]{36}$/i.test(adminId), "active_admin_missing");

  psql(
    runtime,
    `
    insert into public.app_customers (id,customer_type)
    values ('${f.customerId}','particulier');
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values (
      '${f.caseId}','${f.customerId}','${f.caseRef}',clock_timestamp(),
      'system','proof:${f.prefix}','signed_signup_intake','${f.intakeId}',
      '${f.prefix}-case'
    );
    insert into public.app_case_lifecycle_events (
      case_id,promotion_id,lifecycle_state,event_at,actor_type,actor_ref,
      source_class,source_ref,request_id,event_data
    ) values (
      '${f.caseId}',null,'submitted_for_review',clock_timestamp(),'system',
      'proof:${f.prefix}','proof','${f.prefix}:case','${f.prefix}-lifecycle','{}'
    );
  `,
  );

  const member = psql(
    runtime,
    `select public.app_workforce_member_manage_v1(
    '${adminId}','${f.prefix}-member','${f.prefix}-member','${HASH}',
    '${expires}','create','${f.authUserId}',null,'${seniority}',clock_timestamp(),
    'decision:${f.prefix}:member',null
  )->>'ok';`,
  );
  assert(member === "true", "workforce_member_create_failed");
  const workforceId = psql(
    runtime,
    `select id::text
    from public.app_workforce_identities
    where auth_user_id='${f.authUserId}';`,
  );
  assert(/^[0-9a-f-]{36}$/i.test(workforceId), "workforce_identity_missing");
  for (const capability of ["evidence.review.view", "evidence.review.decide"]) {
    const suffix = capability.endsWith("view") ? "view" : "decide";
    const granted = psql(
      runtime,
      `select public.app_workforce_case_assignment_manage_v1(
      '${adminId}','${f.prefix}-${suffix}','${f.prefix}-${suffix}','${HASH}',
      '${expires}','grant','${workforceId}','${capability}','${f.caseId}',
      null,null,null,clock_timestamp(),null,'decision:${f.prefix}:${suffix}',null
    )->>'ok';`,
    );
    assert(granted === "true", `workforce_${suffix}_grant_failed`);
  }

  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    insert into public.app_parties (
      id,party_kind,source_type,source_reference_type,source_reference_id,
      request_id,actor_type,actor_ref
    ) values ('${f.partyId}','natural_person','signed_signup_intake',
      'proof','${f.prefix}-party','${f.prefix}-party','system','proof:${f.prefix}');
    insert into public.app_party_person_versions (
      id,party_id,full_name,valid_from,source_type,source_reference_type,
      source_reference_id,request_id,actor_type,actor_ref
    ) values ('${f.partyProfileId}','${f.partyId}','Proof Person',current_date,
      'signed_signup_intake','proof','${f.prefix}-party-profile',
      '${f.prefix}-party-profile','system','proof:${f.prefix}');
    insert into public.app_customer_party_relationships (
      id,customer_id,party_id,relationship_role,valid_from,source_type,
      source_reference_type,source_reference_id,request_id,actor_type,actor_ref
    ) values ('${f.relationshipId}','${f.customerId}','${f.partyId}',
      'account_owner',current_date,'signed_signup_intake','proof',
      '${f.prefix}-account-owner','${f.prefix}-account-owner','system',
      'proof:${f.prefix}');
    insert into public.app_case_party_roles (
      case_id,party_id,person_profile_version_id,organization_profile_version_id,
      role_type,claim_status,valid_from,recorded_at,recorded_by_actor_type,
      recorded_by_actor_ref,source_class,source_ref,request_id
    ) values ('${f.caseId}','${f.partyId}','${f.partyProfileId}',null,
      'service_recipient','asserted',clock_timestamp(),clock_timestamp(),
      'system','proof:${f.prefix}','signed_signup_intake','${f.prefix}-party',
      '${f.prefix}-party-role');
    insert into public.app_locations (
      id,created_at,created_by_actor_ref,created_from_request_id,creation_basis
    ) values ('${f.locationId}',clock_timestamp(),'proof:${f.prefix}',
      '${f.prefix}-location','customer_declaration');
    insert into public.app_location_address_observations (
      location_id,observation_kind,descriptor_kind,observed_at,recorded_at,
      recorded_by_actor_ref,recorded_from_request_id,source_ref_sha256,
      country_code,declared_address_text
    ) values ('${f.locationId}','customer_declared','unstructured_postal_address',
      clock_timestamp(),clock_timestamp(),'proof:${f.prefix}','${f.prefix}-address',
      '${HASH}','NL','Proof Address');
    insert into public.app_case_location_relations (
      relation_id,case_id,location_id,event_type,effective_at,recorded_at,
      decision_ref,reason_ref,recorded_by_actor_ref,request_id
    ) values (gen_random_uuid(),'${f.caseId}','${f.locationId}','linked',
      clock_timestamp(),clock_timestamp(),'signed_signup_intake',null,
      'proof:${f.prefix}','${f.prefix}-case-location');
    insert into public.app_chargers (
      id,promotion_id,case_id,location_id,source_ref_sha256,created_at,
      created_by_actor_ref,created_from_request_id
    ) values ('${f.chargerId}','${f.promotionId}','${f.caseId}',
      '${f.locationId}','${HASH}',clock_timestamp(),'proof:${f.prefix}',
      '${f.prefix}-charger');
    insert into public.app_signup_signing_snapshots (
      id,intake_id,schema_version,canonical_snapshot,canonical_snapshot_sha256,
      created_at
    ) values ('${f.snapshotId}',gen_random_uuid(),'signup-signing-runtime-snapshot-v1',
      jsonb_build_object('canonical_facts',jsonb_build_object(
        'schema_version','canonical-signing-facts-v1','facts',jsonb_build_array(
          jsonb_build_object('fact_id','party','fact_key','partyName','label','Naam',
            'value','Proof Person','resolution_state','confirmed','required',true),
          jsonb_build_object('fact_id','address','fact_key','structuredAddress','label','Adres',
            'value','Proof Address','resolution_state','review_required','required',true,
            'location_id','location-1'),
          jsonb_build_object('fact_id','ean','fact_key','electricityEan','label','EAN',
            'value','871234567890123456','resolution_state','review_required','required',true,
            'location_id','location-1'),
          jsonb_build_object('fact_id','supplier','fact_key','energySupplier','label','Leverancier',
            'value','Proof Supplier','resolution_state','review_required','required',true,
            'location_id','location-1'),
          jsonb_build_object('fact_id','brand','fact_key','chargerBrand','label','Merk',
            'value','Proof Brand','resolution_state','confirmed','required',true,
            'location_id','location-1','charger_id','charger-1'),
          jsonb_build_object('fact_id','model','fact_key','chargerModel','label','Model',
            'value','Proof Model','resolution_state','confirmed','required',true,
            'location_id','location-1','charger_id','charger-1'),
          jsonb_build_object('fact_id','mid','fact_key','midNumber','label','MID',
            'value','','resolution_state','review_required','required',true,
            'location_id','location-1','charger_id','charger-1'),
          jsonb_build_object('fact_id','serial','fact_key','serialNumber','label','Serienummer',
            'value','PROOF-SERIAL','resolution_state','review_required','required',true,
            'location_id','location-1','charger_id','charger-1')
        ))), '${f.fixtureHash}',clock_timestamp());
    insert into public.app_signup_promotions (
      id,intake_id,customer_id,identity_id,service_recipient_party_id,
      contact_party_id,case_id,signing_snapshot_id,mandate_id,
      signature_evidence_id,account_type,source_signing_sha256,
      promotion_payload_sha256,request_payload_sha256,request_id,
      idempotency_key,actor_type,actor_ref,environment,promoted_at
    ) values ('${f.promotionId}','${f.intakeId}','${f.customerId}',gen_random_uuid(),
      '${f.partyId}','${f.partyId}','${f.caseId}','${f.snapshotId}',gen_random_uuid(),
      gen_random_uuid(),'particulier','${f.fixtureHash}','${f.fixtureHash}',
      '${f.fixtureHash}',
      '${f.prefix}-promotion','${f.prefix}-promotion','system','proof:${f.prefix}',
      'local',clock_timestamp());
    insert into public.app_evidence_files (
      id,case_id,promotion_id,document_type,source_class,source_ref,created_at,
      created_by_actor_ref,request_id
    ) values
      ('${f.energyFileId}','${f.caseId}','${f.promotionId}',
       'energy_bill_or_contract','signup_quarantine_file','${f.prefix}-energy',
       clock_timestamp(),'proof:${f.prefix}','${f.prefix}-energy'),
      ('${f.invoiceFileId}','${f.caseId}','${f.promotionId}',
       'installation_invoice','signup_quarantine_file','${f.prefix}-invoice',
       clock_timestamp(),'proof:${f.prefix}','${f.prefix}-invoice');
    insert into public.app_evidence_versions (
      id,evidence_file_id,version_number,source_intake_file_id,storage_bucket,
      storage_path,detected_mime_type,size_bytes,sha256,status,
      source_confirmed_at,created_at,request_id,idempotency_key
    ) values
      ('${f.energyVersionId}','${f.energyFileId}',1,gen_random_uuid(),'proof-private',
       '${f.prefix}-energy.pdf','application/pdf',100,'${HASH}',
       'confirmed_awaiting_review',clock_timestamp(),clock_timestamp(),
       '${f.prefix}-energy','${f.prefix}-energy'),
      ('${f.invoiceVersionId}','${f.invoiceFileId}',1,gen_random_uuid(),'proof-private',
       '${f.prefix}-invoice.pdf','application/pdf',100,'${HASH}',
       'confirmed_awaiting_review',clock_timestamp(),clock_timestamp(),
       '${f.prefix}-invoice','${f.prefix}-invoice');
    insert into public.app_evidence_declaration_contexts (
      evidence_file_id,promotion_id,source_slot_ref_sha256,location_id,charger_id,
      association_basis,created_at,created_by_actor_ref,created_from_request_id
    ) values
      ('${f.energyFileId}','${f.promotionId}','${HASH}','${f.locationId}',null,
       'single_declared_location',clock_timestamp(),'proof:${f.prefix}',
       '${f.prefix}-energy-context'),
      ('${f.invoiceFileId}','${f.promotionId}','${HASH}','${f.locationId}',
       '${f.chargerId}','single_declared_charger',clock_timestamp(),
       'proof:${f.prefix}','${f.prefix}-invoice-context');
    commit;
  `,
  );
  return Object.freeze({ workforceId, adminId });
}

function grantCustomerAccess(runtime, f) {
  psql(
    runtime,
    `insert into public.app_customer_identities (
    id,customer_id,auth_user_id,email_normalized,email_verified_at,
    identity_provider,status
  ) values (
    '${f.customerIdentityId}','${f.customerId}','${f.authUserId}',
    '${f.email}',clock_timestamp(),'supabase','active'
  );
  insert into public.app_customer_access_grants (
    auth_user_id,customer_id,granted_case_id,access_basis,source_class,
    source_ref,request_id
  ) values (
    '${f.authUserId}','${f.customerId}','${f.caseId}',
    'signed_service_recipient','app_signup_promotion',
    '${f.prefix}-customer-access','${f.prefix}-customer-access'
  );`,
  );
}

async function requestCorrectionChallenge(
  runtime,
  f,
  token,
  key,
  responses,
  typedFullName,
  factResolutions = null,
) {
  const submittedFactResolutions = factResolutions ?? responses
    .filter((response) => typeof response.correctedValue === "string")
    .map((response) => ({
      itemRefs: [response.itemRef],
      resolutionType: "MANUAL",
      sources: [],
    }));
  return await jsonRequest(
    `${runtime.apiUrl}/functions/v1/api-app-customer-correction-signing-challenge`,
    {
      method: "POST",
      headers: {
        apikey: runtime.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        caseRef: f.caseRef,
        responses,
        factResolutions: submittedFactResolutions,
        typedFullName,
      }),
    },
  );
}

async function correctionMailCount(runtime, f) {
  const list = await jsonRequest(`${runtime.mailpitUrl}/api/v1/messages`, {});
  return Array.isArray(list.body?.messages)
    ? list.body.messages.filter((candidate) =>
      candidate?.To?.some((recipient) => recipient?.Address === f.email) &&
      String(candidate?.Subject || "").includes("ondertekencode")
    ).length
    : 0;
}

function correctionChallengeCount(runtime, f) {
  return psql(
    runtime,
    `begin read only; select count(*)
    from public.app_signup_signing_challenges challenge
    join public.app_evidence_review_correction_handoffs handoff
      on handoff.id=challenge.correction_handoff_id
    where handoff.case_id='${f.caseId}'
      and challenge.subject_type='CUSTOMER_CORRECTION'; rollback;`,
  );
}

function addSignerAuthorityDrift(runtime, f) {
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    insert into public.app_party_person_versions (
      id,party_id,full_name,valid_from,source_type,source_reference_type,
      source_reference_id,request_id,actor_type,actor_ref,
      supersedes_person_version_id
    ) values ('${f.partyProfileDriftId}','${f.partyId}',
      'Proof Person Changed',current_date,'proof','proof',
      '${f.prefix}-authority-drift','${f.prefix}-authority-drift','system',
      'proof:${f.prefix}','${f.partyProfileId}');
    commit;`,
  );
}

function removeSignerAuthorityDrift(runtime, f) {
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    delete from public.app_party_person_versions
    where id='${f.partyProfileDriftId}';
    commit;`,
  );
}

async function correctionOtp(runtime, f, challengeReference) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const list = await jsonRequest(`${runtime.mailpitUrl}/api/v1/messages`, {});
    const message = Array.isArray(list.body?.messages)
      ? list.body.messages.find((candidate) =>
        candidate?.To?.some((recipient) => recipient?.Address === f.email) &&
        String(candidate?.Subject || "").includes("ondertekencode")
      )
      : null;
    if (message?.ID) {
      const detail = await jsonRequest(
        `${runtime.mailpitUrl}/api/v1/message/${message.ID}`,
        {},
      );
      const text = String(detail.body?.Text || detail.body?.HTML || "");
      const code = text.match(/(?:^|\D)(\d{6})(?:\D|$)/)?.[1];
      if (code && text.includes(challengeReference)) return code;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("correction_otp_not_delivered");
}

async function finalizeCorrection(runtime, f, token, key, body) {
  return await jsonRequest(
    `${runtime.apiUrl}/functions/v1/api-app-customer-correction-signing-finalize`,
    {
      method: "POST",
      headers: {
        apikey: runtime.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({ caseRef: f.caseRef, ...body }),
    },
  );
}

async function readWorklist(runtime, token) {
  return await jsonRequest(
    `${runtime.apiUrl}/functions/v1/api-app-evidence-review-worklist`,
    {
      method: "GET",
      headers: {
        apikey: runtime.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
      },
    },
  );
}

function grantPublishScope(runtime, f, authority) {
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  const granted = psql(
    runtime,
    `select
    public.app_workforce_case_assignment_manage_v1(
      '${authority.adminId}','${f.prefix}-publish-scope',
      '${f.prefix}-publish-scope','${HASH}','${expires}','grant',
      '${authority.workforceId}','evidence.review.correction.publish',
      '${f.caseId}',null,null,null,clock_timestamp(),null,
      'decision:${f.prefix}:publish',null
    )->>'ok';`,
  );
  assert(granted === "true", "workforce_publish_grant_failed");
}

export function addChangedEvidence(runtime, f) {
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    insert into public.app_evidence_versions (
      id,evidence_file_id,version_number,source_intake_file_id,storage_bucket,
      storage_path,detected_mime_type,size_bytes,sha256,status,
      source_confirmed_at,created_at,request_id,idempotency_key
    ) values ('${f.energyVersionV2Id}','${f.energyFileId}',2,gen_random_uuid(),
      'proof-private','${f.prefix}-energy-v2.pdf','application/pdf',101,
      '${"d".repeat(64)}','confirmed_awaiting_review',clock_timestamp(),
      clock_timestamp(),'${f.prefix}-energy-v2','${f.prefix}-energy-v2');
    commit;`,
  );
}

export async function readDetail(runtime, f, token) {
  const response = await jsonRequest(
    `${runtime.apiUrl}/functions/v1/api-app-evidence-review-case-detail?caseRef=${f.caseRef}`,
    {
      method: "GET",
      headers: {
        apikey: runtime.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
      },
    },
  );
  if (response.status !== 200) {
    const diagnostic = psql(
      runtime,
      `select concat_ws('|',
      source->>'ok',source->>'code',jsonb_typeof(source->'review_subjects'),
      jsonb_array_length(coalesce(source->'review_subjects','[]'::jsonb)),
      source->>'overall_review_status') from (
        select public.app_evidence_review_case_detail_read_v6(
          '${f.authUserId}','${f.caseRef}'
        ) source
      ) probe;`,
    );
    throw new Error(
      `detail_runtime_status_${response.status}_${
        response.body?.code ?? "unknown"
      }_${diagnostic}`,
    );
  }
  assert(
    response.body?.case?.caseRef === f.caseRef &&
      response.body?.reviewManifestVersion === "fact-review-manifest-v1" &&
      /^[0-9a-f]{64}$/.test(String(response.body?.reviewManifestHash)) &&
      Array.isArray(response.body?.reviewSubjects) &&
      response.body.reviewSubjects.length > 0,
    "detail_runtime_contract_invalid",
  );
  return response.body;
}

export async function finalize(runtime, token, idempotencyKey, body) {
  return await jsonRequest(
    `${runtime.apiUrl}/functions/v1/api-app-evidence-review-round-finalize`,
    {
      method: "POST",
      headers: {
        apikey: runtime.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );
}

export async function publishCorrection(
  runtime,
  f,
  token,
  idempotencyKey,
  roundRef,
  coverMessage = `Controleer de correcties voor ${idempotencyKey}.`,
) {
  return await jsonRequest(
    `${runtime.apiUrl}/functions/v1/api-app-evidence-review-correction-publish`,
    {
      method: "POST",
      headers: {
        apikey: runtime.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        caseRef: f.caseRef,
        coverMessage,
        roundRef,
      }),
    },
  );
}

export async function readCustomerHandoff(runtime, f, token) {
  return await jsonRequest(
    `${runtime.apiUrl}/functions/v1/api-app-customer-correction-handoff?caseRef=${f.caseRef}`,
    {
      method: "GET",
      headers: {
        apikey: runtime.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
      },
    },
  );
}

function handoffCount(runtime, f) {
  return psql(
    runtime,
    `begin read only; select count(*)
    from public.app_evidence_review_correction_handoffs
    where case_id='${f.caseId}'; rollback;`,
  );
}

function roundCounts(runtime, f) {
  return psql(
    runtime,
    `begin read only; select concat_ws('|',
    (select count(*) from public.app_evidence_review_rounds
      where case_id='${f.caseId}'),
    (select count(*) from public.app_evidence_review_round_subject_decisions d
      join public.app_evidence_review_rounds r on r.id=d.round_id
      where r.case_id='${f.caseId}')
  ); rollback;`,
  );
}

export function cleanupFixture(runtime, f) {
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    delete from public.app_evidence_review_customer_submission_fact_resolution_sources
      where fact_resolution_id in (
        select resolution.id
        from public.app_evidence_review_customer_submission_fact_resolutions resolution
        join public.app_evidence_review_customer_submissions submission
          on submission.id=resolution.submission_id
        where submission.case_id='${f.caseId}'
      );
    delete from public.app_evidence_review_customer_submission_fact_resolutions
      where submission_id in (select id
        from public.app_evidence_review_customer_submissions
        where case_id='${f.caseId}');
    delete from public.app_customer_correction_fact_resolution_challenge_bindings
      where correction_handoff_id in (select id
        from public.app_evidence_review_correction_handoffs
        where case_id='${f.caseId}');
    delete from public.app_customer_correction_signer_evidence_bindings
      where case_id='${f.caseId}';
    delete from public.app_customer_correction_signer_challenge_bindings
      where case_id='${f.caseId}';
    delete from public.app_evidence_review_decision_carry_forwards
      where submission_id in (select id
        from public.app_evidence_review_customer_submissions
        where case_id='${f.caseId}');
    delete from public.app_evidence_review_customer_submission_items
      where submission_id in (select id
        from public.app_evidence_review_customer_submissions
        where case_id='${f.caseId}');
    delete from public.app_evidence_review_customer_submission_replacements
      where submission_id in (select id
        from public.app_evidence_review_customer_submissions
        where case_id='${f.caseId}');
    delete from public.app_signup_signature_evidence
      where subject_type='CUSTOMER_CORRECTION'
        and subject_ref in (select id
          from public.app_evidence_review_customer_submissions
          where case_id='${f.caseId}');
    delete from public.app_signup_signing_snapshots
      where subject_type='CUSTOMER_CORRECTION'
        and subject_ref in (select id
          from public.app_evidence_review_customer_submissions
          where case_id='${f.caseId}');
    delete from public.app_signup_signing_challenges
      where subject_type='CUSTOMER_CORRECTION'
        and correction_handoff_id in (select id
          from public.app_evidence_review_correction_handoffs
          where case_id='${f.caseId}');
    delete from public.app_evidence_review_customer_submissions
      where case_id='${f.caseId}';
    delete from public.app_evidence_versions
      where correction_replacement_candidate_id in (
        select id
        from public.app_customer_correction_replacement_candidates
        where case_id='${f.caseId}'
      );
    delete from public.app_parser_observation_envelopes
      where correction_replacement_candidate_id in (
        select id
        from public.app_customer_correction_replacement_candidates
        where case_id='${f.caseId}'
      );
    delete from public.app_customer_correction_replacement_candidate_events
      where case_id='${f.caseId}';
    delete from public.app_customer_correction_replacement_candidates
      where case_id='${f.caseId}';
    delete from public.app_customer_correction_replacement_uploads
      where case_id='${f.caseId}';
    delete from public.app_evidence_review_correction_handoffs
      where case_id='${f.caseId}';
    delete from public.app_evidence_review_round_subject_decisions d using
      public.app_evidence_review_rounds r
      where d.round_id=r.id and r.case_id='${f.caseId}';
    delete from public.app_evidence_review_rounds where case_id='${f.caseId}';
    delete from public.app_evidence_declaration_contexts
      where evidence_file_id in ('${f.energyFileId}','${f.invoiceFileId}');
    delete from public.app_evidence_versions
      where evidence_file_id in ('${f.energyFileId}','${f.invoiceFileId}');
    delete from public.app_evidence_files where case_id='${f.caseId}';
    delete from public.app_signup_promotions where id='${f.promotionId}';
    delete from public.app_signup_signing_snapshots where id='${f.snapshotId}';
    delete from public.app_chargers where id='${f.chargerId}';
    delete from public.app_case_location_relations where case_id='${f.caseId}';
    delete from public.app_location_address_observations
      where location_id='${f.locationId}';
    delete from public.app_locations where id='${f.locationId}';
    delete from public.app_case_party_roles where case_id='${f.caseId}';
    delete from public.app_customer_party_relationships
      where customer_id='${f.customerId}';
    delete from public.app_party_person_versions where party_id='${f.partyId}';
    delete from public.app_parties where id='${f.partyId}';
    delete from public.app_audit_events
      where request_id like '${f.prefix}-%' or scope_id='${f.caseId}';
    delete from public.app_idempotency_keys where key like '${f.prefix}-%';
    delete from public.app_workforce_scope_assignments s using
      public.app_workforce_identities i
      where s.workforce_identity_id=i.id and i.auth_user_id='${f.authUserId}';
    delete from public.app_workforce_capability_assignments c using
      public.app_workforce_identities i
      where c.workforce_identity_id=i.id and i.auth_user_id='${f.authUserId}';
    delete from public.app_workforce_seniority_assignments s using
      public.app_workforce_identities i
      where s.workforce_identity_id=i.id and i.auth_user_id='${f.authUserId}';
    delete from public.app_workforce_identity_states s using
      public.app_workforce_identities i
      where s.workforce_identity_id=i.id and i.auth_user_id='${f.authUserId}';
    delete from public.app_workforce_identities where auth_user_id='${f.authUserId}';
    delete from public.app_case_lifecycle_events where case_id='${f.caseId}';
    delete from public.app_customer_access_grants
      where auth_user_id='${f.authUserId}' and customer_id='${f.customerId}';
    delete from public.app_customer_identities
      where id='${f.customerIdentityId}';
    delete from public.app_cases where id='${f.caseId}';
    delete from public.app_customers where id='${f.customerId}';
    commit;`,
  );
}

export function residueCount(runtime, f) {
  return psql(
    runtime,
    `begin read only; select
    (select count(*) from public.app_cases where id='${f.caseId}') +
    (select count(*) from public.app_evidence_review_rounds where case_id='${f.caseId}') +
    (select count(*) from public.app_evidence_review_correction_handoffs
      where case_id='${f.caseId}') +
    (select count(*) from public.app_customer_correction_replacement_uploads
      where case_id='${f.caseId}') +
    (select count(*) from public.app_customer_correction_replacement_candidates
      where case_id='${f.caseId}') +
    (select count(*)
      from public.app_customer_correction_replacement_candidate_events
      where case_id='${f.caseId}') +
    (select count(*)
      from public.app_evidence_review_customer_submission_replacements r
      join public.app_evidence_review_customer_submissions s
        on s.id=r.submission_id
      where s.case_id='${f.caseId}') +
    (select count(*) from public.app_evidence_versions v
      join public.app_evidence_files f2 on f2.id=v.evidence_file_id
      where f2.case_id='${f.caseId}'
        and v.correction_replacement_candidate_id is not null) +
    (select count(*) from public.app_customer_correction_signer_challenge_bindings
      where case_id='${f.caseId}') +
    (select count(*) from public.app_customer_correction_signer_evidence_bindings
      where case_id='${f.caseId}') +
    (select count(*)
      from public.app_customer_correction_fact_resolution_challenge_bindings b
      join public.app_evidence_review_correction_handoffs h
        on h.id=b.correction_handoff_id
      where h.case_id='${f.caseId}') +
    (select count(*)
      from public.app_evidence_review_customer_submission_fact_resolutions r
      join public.app_evidence_review_customer_submissions s
        on s.id=r.submission_id
      where s.case_id='${f.caseId}') +
    (select count(*)
      from public.app_evidence_review_customer_submission_fact_resolution_sources source
      join public.app_evidence_review_customer_submission_fact_resolutions r
        on r.id=source.fact_resolution_id
      join public.app_evidence_review_customer_submissions s
        on s.id=r.submission_id
      where s.case_id='${f.caseId}') +
    (select count(*) from public.app_customer_access_grants
      where auth_user_id='${f.authUserId}' and customer_id='${f.customerId}') +
    (select count(*) from public.app_workforce_identities
      where auth_user_id='${f.authUserId}') +
    (select count(*) from public.app_audit_events
      where request_id like '${f.prefix}-%') +
    (select count(*) from public.app_idempotency_keys
      where key like '${f.prefix}-%'); rollback;`,
  );
}

async function main() {
  const runtime = localRuntime();
  const prefix = `review15-runtime-${Date.now()}-${
    crypto.randomUUID().slice(0, 8)
  }`;
  const beforePilot = pilotState(runtime);
  const beforeFingerprint = relevantFingerprint(runtime);
  let auth = null;
  let f = null;
  let proofError = null;
  let cleanupError = null;
  try {
    auth = await createAuth(runtime, prefix);
    f = fixture(prefix, auth.userId);
    const authority = setupFixture(runtime, f);

    const initial = await readDetail(runtime, f, auth.token);
    assert(
      initial.case?.canPublishCorrection === false,
      "served_publish_affordance_not_scope_derived",
    );
    const initialDecisions = initial.reviewSubjects.map((subject) => ({
      subjectRef: subject.subjectRef,
      disposition: "ACCEPTED",
    }));
    const invalid = await finalize(runtime, auth.token, `${prefix}-invalid`, {
      caseRef: f.caseRef,
      manifestVersion: initial.reviewManifestVersion,
      manifestHash: initial.reviewManifestHash,
      decisions: initialDecisions.slice(1),
    });
    assert(
      invalid.status === 409 &&
        invalid.body?.code === "manifest_subjects_mismatch" &&
        roundCounts(runtime, f) === "0|0",
      "invalid_request_partial_write",
    );

    addChangedEvidence(runtime, f);
    const stale = await finalize(runtime, auth.token, `${prefix}-stale`, {
      caseRef: f.caseRef,
      manifestVersion: initial.reviewManifestVersion,
      manifestHash: initial.reviewManifestHash,
      decisions: initialDecisions,
    });
    assert(
      stale.status === 409 && stale.body?.code === "stale_review_manifest" &&
        roundCounts(runtime, f) === "0|0",
      "stale_manifest_not_denied",
    );

    const current = await readDetail(runtime, f, auth.token);
    assert(
      current.reviewManifestHash !== initial.reviewManifestHash,
      "manifest_did_not_change",
    );
    const correctionIndex = current.reviewSubjects.findIndex((subject) =>
      subject.factKey === "electricityEan"
    );
    assert(
      correctionIndex >= 0,
      `ean_subject_missing_${
        current.reviewSubjects.map((subject) =>
          subject.factKey ?? subject.fact_key ?? "NONE"
        ).join("_")
      }`,
    );
    const decisions = current.reviewSubjects.map((subject, index) =>
      index === correctionIndex || subject.valueStatus === "REQUIRED_MISSING"
        ? {
          subjectRef: subject.subjectRef,
          disposition: "CORRECTION_REQUIRED",
          correctionReason: "INCORRECT_INFORMATION",
          correctionInstruction: "Controleer dit bewijsgegeven.",
        }
        : { subjectRef: subject.subjectRef, disposition: "ACCEPTED" }
    );
    const body = {
      caseRef: f.caseRef,
      manifestVersion: current.reviewManifestVersion,
      manifestHash: current.reviewManifestHash,
      decisions,
    };
    const key = `${prefix}-valid`;
    const valid = await finalize(runtime, auth.token, key, body);
    assert(
      valid.status === 201 && valid.body?.result === "FINALIZED" &&
        valid.body?.outcome === "CORRECTIONS_REQUIRED",
      `valid_round_failed_${valid.status}_${valid.body?.code ?? "unknown"}`,
    );
    const expectedCounts = `1|${current.reviewSubjects.length}`;
    assert(
      roundCounts(runtime, f) === expectedCounts,
      "valid_round_counts_invalid",
    );

    const retry = await finalize(runtime, auth.token, key, body);
    assert(
      [200, 201].includes(retry.status) &&
        ["FINALIZED", "ALREADY_FINALIZED"].includes(retry.body?.result) &&
        retry.body?.roundRef === valid.body?.roundRef &&
        roundCounts(runtime, f) === expectedCounts,
      "exact_retry_not_idempotent",
    );

    const conflict = await finalize(runtime, auth.token, `${prefix}-conflict`, {
      ...body,
      decisions: current.reviewSubjects.map((subject) => ({
        subjectRef: subject.subjectRef,
        disposition: "ACCEPTED",
      })),
    });
    assert(
      conflict.status === 409 &&
        conflict.body?.code === "review_round_conflict" &&
        roundCounts(runtime, f) === expectedCounts,
      "conflicting_finalization_not_denied",
    );

    const workforceOnlyRead = await readCustomerHandoff(runtime, f, auth.token);
    assert(
      workforceOnlyRead.status === 404 &&
        workforceOnlyRead.body?.code === "customer_case_access_denied",
      "workforce_scope_became_customer_authority",
    );
    const beforePublishRead = await readCustomerHandoff(runtime, f, auth.token);
    assert(
      beforePublishRead.status === 404 &&
        beforePublishRead.body?.code === "customer_case_access_denied",
      "customer_read_did_not_require_access_grant",
    );

    const decideOnlyPublish = await publishCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-publish-denied`,
      valid.body.roundRef,
    );
    assert(
      decideOnlyPublish.status === 403 &&
        decideOnlyPublish.body?.code === "case_scope_denied" &&
        handoffCount(runtime, f) === "0",
      "decide_capability_substituted_for_publish",
    );
    grantPublishScope(runtime, f, authority);
    const publishAuthorizedDetail = await readDetail(runtime, f, auth.token);
    assert(
      publishAuthorizedDetail.case?.canPublishCorrection === true &&
        publishAuthorizedDetail.overallReviewStatus === "CORRECTION_REQUIRED",
      "served_publish_affordance_not_authoritative",
    );
    const concurrentCoverMessage = "Controleer deze correcties zorgvuldig.";
    const [publishA, publishB] = await Promise.all([
      publishCorrection(
        runtime,
        f,
        auth.token,
        `${prefix}-publish-a`,
        valid.body.roundRef,
        concurrentCoverMessage,
      ),
      publishCorrection(
        runtime,
        f,
        auth.token,
        `${prefix}-publish-b`,
        valid.body.roundRef,
        concurrentCoverMessage,
      ),
    ]);
    const publishResults = [publishA.body?.result, publishB.body?.result]
      .sort().join("|");
    assert(
      publishResults === "ALREADY_PUBLISHED|PUBLISHED" &&
        publishA.body?.handoffRef === publishB.body?.handoffRef &&
        handoffCount(runtime, f) === "1",
      `concurrent_publish_invalid_${publishResults}_${publishA.status}_${
        publishA.body?.code ?? "ok"
      }_${publishB.status}_${publishB.body?.code ?? "ok"}`,
    );
    const publishRetry = await publishCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-publish-a`,
      valid.body.roundRef,
      concurrentCoverMessage,
    );
    assert(
      [200, 201].includes(publishRetry.status) &&
        publishRetry.body?.handoffRef === publishA.body?.handoffRef &&
        handoffCount(runtime, f) === "1",
      "publish_retry_not_idempotent",
    );

    const noGrantPublishedRead = await readCustomerHandoff(
      runtime,
      f,
      auth.token,
    );
    assert(
      noGrantPublishedRead.status === 404 &&
        noGrantPublishedRead.body?.code === "customer_case_access_denied",
      "publication_created_customer_read_authority",
    );
    grantCustomerAccess(runtime, f);
    const customerRead = await readCustomerHandoff(runtime, f, auth.token);
    const customerSerialized = JSON.stringify(customerRead.body);
    const expectedCorrectionCount = decisions.filter((decision) =>
      decision.disposition === "CORRECTION_REQUIRED"
    ).length;
    const eanItem = customerRead.body?.handoff?.items?.find((item) =>
      item.factKey === "electricityEan"
    );
    assert(
      customerRead.status === 200 &&
        customerRead.body?.schemaVersion === "customer-correction-handoff-v6" &&
        customerRead.body?.caseRef === f.caseRef &&
        customerRead.body?.handoff?.signerAuthority?.status === "available" &&
        customerRead.body?.handoff?.signerAuthority
            ?.expectedSignerDisplayName === "Proof Person" &&
        customerRead.body?.handoff?.coverMessage === concurrentCoverMessage &&
        Array.isArray(customerRead.body?.handoff?.items) &&
        customerRead.body.handoff.items.length === expectedCorrectionCount &&
        customerRead.body.handoff.items.every((item) =>
          /^CCI-[A-F0-9]{32}$/.test(String(item.itemRef)) &&
          item.responseRequirement === "MISSING_VALUE" &&
          !("currentValue" in item) &&
          item.correctionReason === "INCORRECT_INFORMATION" &&
          item.correctionInstruction === "Controleer dit bewijsgegeven."
        ) &&
        eanItem?.documentLabel === "Energiedocument" &&
        /^CCI-[A-F0-9]{32}$/.test(
          String(eanItem?.itemRef),
        ) &&
        !customerSerialized.includes("subjectRef") &&
        !customerSerialized.includes("manifest") &&
        !customerSerialized.includes("reviewer") &&
        !customerSerialized.includes("policy") &&
        !customerSerialized.includes("bundleSha"),
      `customer_safe_handoff_runtime_invalid:${customerRead.status}:` +
        `${customerRead.body?.schemaVersion ?? "NONE"}:` +
        `${customerRead.body?.handoff?.items?.length ?? "NONE"}:` +
        `${
          customerRead.body?.handoff?.items?.[0]?.responseRequirement ?? "NONE"
        }:` +
        `${!("currentValue" in
          (customerRead.body?.handoff?.items?.[0] ?? {}))}`,
    );
    const waiting = await readDetail(runtime, f, auth.token);
    assert(
      waiting.overallReviewStatus === "WAITING_CUSTOMER" &&
        waiting.case?.canPublishCorrection === true,
      "waiting_customer_status_not_derived",
    );

    const originalSnapshotHash = psql(
      runtime,
      `select canonical_snapshot_sha256
      from public.app_signup_signing_snapshots where id='${f.snapshotId}';`,
    );
    const correctedValues = Object.freeze({
      structuredAddress: "Proofstraat 1, 1234 AB Utrecht",
      electricityEan: "871234567890123456",
      chargerBrand: "Proof Brand",
      chargerModel: "Proof Model",
      midNumber: "MID-123",
      serialNumber: "PROOF-SERIAL",
    });
    const correctionResponses = customerRead.body.handoff.items.map((item) => ({
      itemRef: item.itemRef,
      correctedValue: correctedValues[item.factKey],
    }));
    const factResolutionGroups = new Map();
    for (const item of customerRead.body.handoff.items) {
      const itemRefs = factResolutionGroups.get(item.factKey) ?? [];
      itemRefs.push(item.itemRef);
      factResolutionGroups.set(item.factKey, itemRefs);
    }
    const correctionFactResolutions = [...factResolutionGroups.values()].map(
      (itemRefs) => ({ itemRefs, resolutionType: "MANUAL", sources: [] }),
    );
    const mailCountBeforeWrongName = await correctionMailCount(runtime, f);
    for (
      const [suffix, typedFullName] of [
        ["different", "Daan Koote"],
        ["partial", "Proof"],
        ["empty", ""],
      ]
    ) {
      const rejectedName = await requestCorrectionChallenge(
        runtime,
        f,
        auth.token,
        `${prefix}-correction-name-${suffix}`,
        correctionResponses,
        typedFullName,
        correctionFactResolutions,
      );
      assert(
        rejectedName.status === 400 &&
          ["signer_name_mismatch", "invalid_input"].includes(
            rejectedName.body?.code,
          ),
        `incorrect_signer_name_not_denied_${suffix}`,
      );
    }
    assert(
      correctionChallengeCount(runtime, f) === "0" &&
        await correctionMailCount(runtime, f) === mailCountBeforeWrongName,
      "incorrect_signer_name_created_challenge_or_otp",
    );
    const challenge = await requestCorrectionChallenge(
      runtime,
      f,
      auth.token,
      `${prefix}-correction-challenge`,
      correctionResponses,
      "Proof Person",
      correctionFactResolutions,
    );
    assert(
      challenge.status === 201 && challenge.body?.ok === true &&
        /^[0-9a-f-]{36}$/i.test(String(challenge.body?.challenge_reference)) &&
        challenge.body?.item_count === correctionResponses.length &&
        challenge.body?.legal_bundle?.bundleVersion ===
          "customer-correction-confirmation-nl-v1",
      `correction_challenge_failed_${challenge.status}_${
        challenge.body?.code ?? "unknown"
      }`,
    );
    const challengeReference = String(challenge.body.challenge_reference);
    const otp = await correctionOtp(runtime, f, challengeReference);
    addSignerAuthorityDrift(runtime, f);
    const driftedAuthority = await finalizeCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-correction-authority-drift`,
      {
        challengeReference,
        otp,
        typedFullName: "Proof Person Changed",
      },
    );
    assert(
      driftedAuthority.status === 409 &&
        driftedAuthority.body?.code === "signer_authority_changed" &&
        psql(
            runtime,
            `select count(*) from public.app_evidence_review_customer_submissions
            where case_id='${f.caseId}';`,
          ) === "0",
      "signer_authority_drift_not_fail_closed",
    );
    removeSignerAuthorityDrift(runtime, f);
    const wrongOtp = otp === "000000" ? "000001" : "000000";
    const invalidOtp = await finalizeCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-correction-invalid-otp`,
      {
        challengeReference,
        otp: wrongOtp,
        typedFullName: "Proof Person",
      },
    );
    assert(
      invalidOtp.status === 400 &&
        psql(
            runtime,
            `select count(*) from
          public.app_evidence_review_customer_submissions
          where case_id='${f.caseId}';`,
          ) === "0",
      "invalid_otp_created_partial_submission",
    );
    const finalizeBody = {
      challengeReference,
      otp,
      typedFullName: "Proof Person",
    };
    const [finalizeA, finalizeB] = await Promise.all([
      finalizeCorrection(
        runtime,
        f,
        auth.token,
        `${prefix}-correction-finalize-a`,
        finalizeBody,
      ),
      finalizeCorrection(
        runtime,
        f,
        auth.token,
        `${prefix}-correction-finalize-b`,
        finalizeBody,
      ),
    ]);
    const finalized = [finalizeA, finalizeB].find((result) =>
      result.status === 201 && result.body?.code === "finalized"
    );
    const deniedConcurrent = [finalizeA, finalizeB].find((result) =>
      result.status === 409
    );
    assert(
      finalized && deniedConcurrent,
      `concurrent_correction_not_single_${finalizeA.status}_${
        finalizeA.body?.code ?? "unknown"
      }_${finalizeB.status}_${finalizeB.body?.code ?? "unknown"}`,
    );
    const winningKey = finalized === finalizeA
      ? `${prefix}-correction-finalize-a`
      : `${prefix}-correction-finalize-b`;
    const retryFinalized = await finalizeCorrection(
      runtime,
      f,
      auth.token,
      winningKey,
      finalizeBody,
    );
    assert(
      retryFinalized.status === 200 &&
        retryFinalized.body?.code === "already_finalized" &&
        retryFinalized.body?.submission_ref === finalized.body?.submission_ref,
      "exact_correction_retry_not_idempotent",
    );
    const changedRetry = await finalizeCorrection(
      runtime,
      f,
      auth.token,
      winningKey,
      { ...finalizeBody, typedFullName: "Different Proof Customer" },
    );
    assert(
      changedRetry.status === 400 &&
        changedRetry.body?.code === "signer_name_mismatch",
      "changed_signer_retry_not_denied",
    );
    const submissionEvidence = psql(
      runtime,
      `select concat_ws('|',
      (select count(*) from public.app_evidence_review_customer_submissions
        where case_id='${f.caseId}'),
      (select count(*) from public.app_evidence_review_customer_submission_items i
        join public.app_evidence_review_customer_submissions s on s.id=i.submission_id
        where s.case_id='${f.caseId}'),
      (select count(*) from public.app_evidence_review_decision_carry_forwards c
        join public.app_evidence_review_customer_submissions s on s.id=c.submission_id
        where s.case_id='${f.caseId}'),
      (select count(*) from public.app_signup_signing_challenges ch
        join public.app_evidence_review_correction_handoffs h
          on h.id=ch.correction_handoff_id
        where h.case_id='${f.caseId}' and ch.consumed_at is not null),
      (select count(*) from public.app_customer_correction_signer_challenge_bindings
        where case_id='${f.caseId}'),
      (select count(*) from public.app_customer_correction_signer_evidence_bindings
        where case_id='${f.caseId}'),
      (select canonical_snapshot_sha256='${originalSnapshotHash}'
        from public.app_signup_signing_snapshots where id='${f.snapshotId}'),
      (select coalesce(string_agg(d.fact_key,',' order by d.fact_key),'NONE')
        from public.app_evidence_review_round_subject_decisions d
        join public.app_evidence_review_rounds r on r.id=d.round_id
        where r.case_id='${f.caseId}' and d.disposition='ACCEPTED'
          and not exists (select 1
            from public.app_evidence_review_decision_carry_forwards c
            where c.prior_decision_id=d.id))
    );`,
    );
    assert(
      submissionEvidence ===
        `1|${expectedCorrectionCount}|${
          current.reviewSubjects.length - expectedCorrectionCount
        }|1|1|1|t|NONE`,
      `correction_submission_evidence_invalid_${submissionEvidence}_expected_${
        current.reviewSubjects.length - expectedCorrectionCount
      }`,
    );
    const answered = await readCustomerHandoff(runtime, f, auth.token);
    const postCorrection = await readDetail(runtime, f, auth.token);
    const worklist = await readWorklist(runtime, auth.token);
    const reentered = worklist.body?.cases?.find((row) =>
      row.caseRef === f.caseRef
    );
    assert(
      answered.status === 200 && answered.body?.handoff === null &&
        postCorrection.overallReviewStatus === "TO_REVIEW" &&
        postCorrection.reviewManifestHash !== current.reviewManifestHash &&
        worklist.status === 200 &&
        reentered?.overallReviewStatus === "TO_REVIEW" &&
        reentered?.unresolvedFactCount === expectedCorrectionCount,
      `post_correction_projection_invalid:${answered.status}:` +
        `${answered.body?.handoff === null}:` +
        `${postCorrection.overallReviewStatus}:` +
        `${postCorrection.reviewManifestHash !== current.reviewManifestHash}:` +
        `${worklist.status}:${reentered?.overallReviewStatus ?? "NONE"}:` +
        `${reentered?.unresolvedFactCount ?? "NONE"}`,
    );
  } catch (error) {
    proofError = error;
  } finally {
    if (f) {
      try {
        cleanupFixture(runtime, f);
      } catch (error) {
        cleanupError = error;
      }
    }
    if (auth?.userId) {
      try {
        await deleteAuth(runtime, auth.userId);
      } catch (error) {
        cleanupError ??= error;
      }
    }
  }

  if (cleanupError) throw cleanupError;
  if (f) assert(residueCount(runtime, f) === "0", "proof_fixture_residue");
  assert(
    relevantFingerprint(runtime) === beforeFingerprint,
    "active_database_fingerprint_changed",
  );
  assert(pilotState(runtime) === beforePilot, "pilot_changed_by_served_proof");
  if (proofError) throw proofError;

  process.stdout.write(
    [
      "SERVED_FINALIZER_KONG_EDGE_AUTH_RPC=PASS",
      "SERVED_FINALIZER_VALID_ROUND=PASS",
      "SERVED_FINALIZER_IDEMPOTENT_RETRY=PASS",
      "SERVED_FINALIZER_STALE_DENIED=PASS",
      "SERVED_FINALIZER_CONFLICT_DENIED=PASS",
      "SERVED_FINALIZER_NO_PARTIAL_WRITE=PASS",
      "SERVED_FINALIZER_FIXTURE_CLEANUP=PASS",
      "SERVED_FINALIZER_PILOT_INTEGRITY=PASS",
      "SERVED_CORRECTION_PUBLISH_AUTHORITY=PASS",
      "SERVED_CORRECTION_PUBLISH_CONCURRENT_IDEMPOTENT=PASS",
      "SERVED_CUSTOMER_CORRECTION_READ=PASS",
      "SERVED_WAITING_CUSTOMER_DERIVATION=PASS",
      "SERVED_CUSTOMER_CORRECTION_CHALLENGE=PASS",
      "SERVED_CUSTOMER_CORRECTION_WRONG_NAME_NO_OTP=PASS",
      "SERVED_CUSTOMER_CORRECTION_AUTHORITY_DRIFT_DENIED=PASS",
      "SERVED_CUSTOMER_CORRECTION_FINALIZE=PASS",
      "SERVED_CUSTOMER_CORRECTION_IDEMPOTENCY=PASS",
      "SERVED_CUSTOMER_CORRECTION_CARRY_FORWARD=PASS",
      "SERVED_CUSTOMER_CORRECTION_WORKLIST_REENTRY=PASS",
      "SERVED_CUSTOMER_CORRECTION_PILOT_UNCHANGED=PASS",
      "EVIDENCE_FACT_REVIEW_SERVED_Q01_Q20=PASS",
    ].join("\n") + "\n",
  );
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `SERVED_FINALIZER_PROOF=FAIL:${scrub(error?.message ?? error)}\n`,
    );
    process.exitCode = 1;
  });
}

export {
  addSignerAuthorityDrift,
  assert,
  correctionOtp,
  createAuth,
  deleteAuth,
  finalizeCorrection,
  fixture,
  grantCustomerAccess,
  grantPublishScope,
  handoffCount,
  jsonRequest,
  localRuntime,
  pilotState,
  psql,
  readWorklist,
  relevantFingerprint,
  removeSignerAuthorityDrift,
  requestCorrectionChallenge,
  roundCounts,
  scrub,
  setupFixture,
};
