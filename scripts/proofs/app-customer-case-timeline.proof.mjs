#!/usr/bin/env node

// LOCAL_SERVICE proof for CUSTOMER_TIMELINE_V1. It creates one synthetic
// customer/case graphs, reads only through the new RPC, and removes the exact
// fixtures in finally. It never prints fixture identifiers, Auth material,
// source payloads, database credentials, or response bodies.

import {
  assert,
  cleanupFixture,
  createAuth,
  deleteAuth,
  fixture,
  grantCustomerAccess,
  localRuntime,
  psql,
  residueCount,
  setupFixture,
} from "./app-evidence-fact-review-round-served.proof.mjs";

const HASH = "a".repeat(64);
const EVENT_TYPES = new Set([
  "dossier_submitted",
  "correction_requested",
  "correction_submitted",
  "review_completed",
]);
const PHASE_PRIORITY = Object.freeze({
  dossier_submitted: 20,
  correction_requested: 30,
  correction_submitted: 40,
  review_completed: 50,
});
const FORBIDDEN_OUTPUT_MARKERS = [
  "auth_user_id",
  "customer_id",
  "workforce",
  "email",
  "hash",
  "manifest",
  "bundle",
  "reason",
  "note",
  "requestmetadata",
  "metadata",
  "verifier",
  "eligibility",
  "kwh",
  "finance",
  "parser",
  "error",
  "source_id",
  "actor_ref",
];
const TIMELINE_SOURCE_TABLES = [
  "app_signup_signature_evidence",
  "app_signup_promotions",
  "app_case_lifecycle_events",
  "app_evidence_review_rounds",
  "app_evidence_review_correction_handoffs",
  "app_evidence_review_customer_submissions",
];

function readTimeline(runtime, authUserId, caseId) {
  return JSON.parse(psql(
    runtime,
    `begin read only;
    set local role service_role;
    select public.app_customer_case_timeline_read_v1(
      '${authUserId}'::uuid,
      '${caseId}'::uuid
    )::text;
    rollback;`,
  ));
}

function assertDirectDenied(runtime, role, sql) {
  let denied = false;
  try {
    psql(runtime, `begin read only; set local role ${role}; ${sql}; rollback;`);
  } catch (error) {
    denied = /permission denied/i.test(
      String(error?.stderr ?? error?.message ?? error),
    );
  }
  assert(denied, `direct_${role}_access_not_denied`);
}

function assertSuccess(result) {
  assert(result?.ok === true && result.status === 200, "timeline_not_success");
  assert(
    result.code === "ok" && Array.isArray(result.timeline),
    "timeline_shape_invalid",
  );
  assert(result.timeline.length <= 50, "timeline_limit_exceeded");
  for (const event of result.timeline) {
    assert(
      Object.keys(event).sort().join("|") ===
        "event_id|event_type|occurred_at",
      "timeline_event_shape_not_exact",
    );
    assert(/^tle_[0-9a-f]{32}$/.test(event.event_id), "event_id_not_opaque");
    assert(EVENT_TYPES.has(event.event_type), "event_type_not_allowlisted");
    assert(
      new Date(event.occurred_at).toISOString() === event.occurred_at,
      "event_timestamp_not_utc",
    );
  }
  assert(
    new Set(result.timeline.map((event) => event.event_id)).size ===
      result.timeline.length,
    "timeline_event_duplicate",
  );
}

function assertOrdered(events) {
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    assert(
      previous.occurred_at >= current.occurred_at,
      "timeline_time_order_invalid",
    );
    if (previous.occurred_at !== current.occurred_at) continue;
    assert(
      PHASE_PRIORITY[previous.event_type] >= PHASE_PRIORITY[current.event_type],
      "timeline_phase_order_invalid",
    );
    if (
      PHASE_PRIORITY[previous.event_type] === PHASE_PRIORITY[current.event_type]
    ) {
      assert(
        previous.event_id <= current.event_id,
        "timeline_event_id_order_invalid",
      );
    }
  }
}

function publicReference(prefix, id) {
  return `${prefix}-${id.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

function withLocalFixtureAdmin(runtime) {
  const database = new URL(runtime.dbUrl);
  assert(
    database.hostname === "127.0.0.1" && database.port === "54322",
    "non_local_database_target",
  );
  database.username = "supabase_admin";
  return Object.freeze({ ...runtime, dbUrl: database.toString() });
}

function adaptFixtureToSignedCase(runtime, f, ids) {
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    insert into public.app_signup_signature_evidence (
      id,intake_id,snapshot_id,mandate_id,challenge_id,method_id,
      method_version,typed_full_name,signer_role,channel_reference_sha256,
      evidence_envelope,finalized_at,subject_type,subject_ref
    ) values (
      '${ids.signatureId}','${ids.intakeId}','${f.snapshotId}',
      '${ids.mandateId}','${ids.challengeId}','typed_name_otp_v1','1',
      'Proof Person','', '${HASH}',jsonb_build_object('proof',true),
      '2026-01-01T10:00:00.000Z','SIGNUP_INTAKE',null
    );
    update public.app_signup_signing_snapshots
      set intake_id='${ids.intakeId}'
      where id='${f.snapshotId}';
    update public.app_signup_promotions set
      intake_id='${ids.intakeId}',
      identity_id='${f.customerIdentityId}',
      mandate_id='${ids.mandateId}',
      signature_evidence_id='${ids.signatureId}',
      promoted_at='2026-01-01T10:02:00.000Z'
      where id='${f.promotionId}';
    update public.app_cases set
      source_class='signed_signup_intake',
      source_ref='${ids.intakeId}'
      where id='${f.caseId}';
    update public.app_case_lifecycle_events set
      promotion_id='${f.promotionId}',
      lifecycle_state='submitted_for_review',
      event_at='2026-01-01T10:01:00.000Z',
      source_class='signed_signup_intake',
      source_ref='${ids.intakeId}'
      where case_id='${f.caseId}';
    commit;`,
  );
}

function insertEventMatrix(runtime, f, ids) {
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    insert into public.app_evidence_review_rounds (
      id,case_id,manifest_version,manifest_hash,outcome,
      reviewer_workforce_identity_id,reviewer_scope_assignment_id,
      capability_code,authorization_policy_version_id,payload_sha256,
      request_id,idempotency_key,finalized_at,recorded_at
    ) values
      ('${ids.roundA}','${f.caseId}','fact-review-manifest-v1',
       '${"b".repeat(64)}','CORRECTIONS_REQUIRED',gen_random_uuid(),
       gen_random_uuid(),'evidence.review.decide',gen_random_uuid(),'${HASH}',
       '${f.prefix}-round-a','${f.prefix}-round-a',
       '2026-01-02T10:00:00.000Z','2026-01-02T10:00:00.000Z'),
      ('${ids.roundB}','${f.caseId}','fact-review-manifest-v1',
       '${"c".repeat(64)}','CORRECTIONS_REQUIRED',gen_random_uuid(),
       gen_random_uuid(),'evidence.review.decide',gen_random_uuid(),'${HASH}',
       '${f.prefix}-round-b','${f.prefix}-round-b',
       '2026-01-03T10:00:00.000Z','2026-01-03T10:00:00.000Z'),
      ('${ids.roundCompleted}','${f.caseId}','fact-review-manifest-v1',
       '${"d".repeat(64)}','ALL_FACTS_ACCEPTED',gen_random_uuid(),
       gen_random_uuid(),'evidence.review.decide',gen_random_uuid(),'${HASH}',
       '${f.prefix}-round-completed','${f.prefix}-round-completed',
       '2026-01-04T10:00:00.000Z','2026-01-04T10:00:00.000Z');

    insert into public.app_evidence_review_correction_handoffs (
      id,handoff_reference,case_id,round_id,manifest_version,manifest_hash,
      target_customer_id,correction_bundle,bundle_sha256,
      publisher_workforce_identity_id,publisher_scope_assignment_id,
      capability_code,authorization_policy_version_id,payload_sha256,
      request_id,idempotency_key,published_at,recorded_at,
      supersedes_handoff_id,supersession_reason,supersession_explanation
    ) values
      ('${ids.rootA}','${
      publicReference("CRH", ids.rootA)
    }','${f.caseId}','${ids.roundA}',
       'fact-review-manifest-v1','${"b".repeat(64)}','${f.customerId}',
       jsonb_build_object('schema_version','evidence-review-correction-handoff-bundle-v1',
         'items',jsonb_build_array(jsonb_build_object('item_ref','proof-a'))),
       '${HASH}',gen_random_uuid(),gen_random_uuid(),
       'evidence.review.correction.publish',gen_random_uuid(),'${HASH}',
       '${f.prefix}-handoff-root-a','${f.prefix}-handoff-root-a',
       '2026-01-02T10:01:00.000Z','2026-01-02T10:01:00.000Z',
       null,null,null),
      ('${ids.leafA}','${
      publicReference("CRH", ids.leafA)
    }','${f.caseId}','${ids.roundA}',
       'fact-review-manifest-v1','${"b".repeat(64)}','${f.customerId}',
       jsonb_build_object('schema_version','evidence-review-correction-handoff-bundle-v1',
         'items',jsonb_build_array(jsonb_build_object('item_ref','proof-a-leaf'))),
       '${HASH}',gen_random_uuid(),gen_random_uuid(),
       'evidence.review.correction.supersede',gen_random_uuid(),'${HASH}',
       '${f.prefix}-handoff-leaf-a','${f.prefix}-handoff-leaf-a',
       '2026-01-02T10:02:00.000Z','2026-01-02T10:02:00.000Z',
       '${ids.rootA}','PROCESS_CORRECTION',null),
      ('${ids.leafB}','${
      publicReference("CRH", ids.leafB)
    }','${f.caseId}','${ids.roundB}',
       'fact-review-manifest-v1','${"c".repeat(64)}','${f.customerId}',
       jsonb_build_object('schema_version','evidence-review-correction-handoff-bundle-v1',
         'items',jsonb_build_array(jsonb_build_object('item_ref','proof-b'))),
       '${HASH}',gen_random_uuid(),gen_random_uuid(),
       'evidence.review.correction.publish',gen_random_uuid(),'${HASH}',
       '${f.prefix}-handoff-b','${f.prefix}-handoff-b',
       '2026-01-03T10:01:00.000Z','2026-01-03T10:01:00.000Z',
       null,null,null);

    insert into public.app_evidence_review_customer_submissions (
      id,submission_reference,handoff_id,case_id,customer_id,
      correction_generation,parent_snapshot_id,parent_snapshot_sha256,
      resulting_snapshot_id,resulting_snapshot_sha256,signature_evidence_id,
      signing_method_id,signing_method_version,correction_legal_bundle_version,
      correction_legal_bundle_sha256,auth_user_id,customer_identity_id,
      actor_ref,normalized_payload_sha256,request_id,idempotency_key,
      environment,finalized_at,recorded_at
    ) values
      ('${ids.submissionA}','${
      publicReference("CRS", ids.submissionA)
    }','${ids.leafA}',
       '${f.caseId}','${f.customerId}',1,gen_random_uuid(),'${HASH}',
       gen_random_uuid(),'${HASH}',gen_random_uuid(),'typed_name_otp_v1','1',
       'customer-correction-confirmation-nl-v1','${HASH}','${f.authUserId}',
       '${f.customerIdentityId}','app_customer_identity:${f.customerIdentityId}',
       '${HASH}','${f.prefix}-submission-a','${f.prefix}-submission-a','local',
       '2026-01-02T10:03:00.000Z','2026-01-02T10:03:00.000Z'),
      ('${ids.submissionB}','${
      publicReference("CRS", ids.submissionB)
    }','${ids.leafB}',
       '${f.caseId}','${f.customerId}',2,gen_random_uuid(),'${HASH}',
       gen_random_uuid(),'${HASH}',gen_random_uuid(),'typed_name_otp_v1','1',
       'customer-correction-confirmation-nl-v1','${HASH}','${f.authUserId}',
       '${f.customerIdentityId}','app_customer_identity:${f.customerIdentityId}',
       '${HASH}','${f.prefix}-submission-b','${f.prefix}-submission-b','local',
       '2026-01-03T10:02:00.000Z','2026-01-03T10:02:00.000Z');
    commit;`,
  );
}

function insertSameCustomerLegacyCase(runtime, f, ids) {
  psql(
    runtime,
    `begin;
    insert into public.app_customer_dossiers (
      id,customer_id,dossier_number,account_type,status,submitted_at
    ) values (
      '${ids.sameCustomerDossierId}','${f.customerId}',
      '${f.prefix}-second','vve','submitted',clock_timestamp()
    );
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values (
      '${ids.sameCustomerCaseId}','${f.customerId}',
      '${ids.sameCustomerCaseRef}',clock_timestamp(),'system',
      'proof:${f.prefix}','app_customer_dossier',
      '${ids.sameCustomerDossierId}','${f.prefix}-second-case'
    );
    commit;`,
  );
}

function adaptFixtureToLegacyCase(runtime, f, dossierId) {
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    insert into public.app_customer_dossiers (
      id,customer_id,dossier_number,account_type,status,submitted_at
    ) values (
      '${dossierId}','${f.customerId}','${f.prefix}-legacy',
      'particulier','submitted',clock_timestamp()
    );
    update public.app_cases set
      source_class='app_customer_dossier',
      source_ref='${dossierId}'
      where id='${f.caseId}';
    commit;`,
  );
}

function relevantState(runtime, f, ids) {
  return psql(
    runtime,
    `select concat_ws('|',
    (select count(*) from public.app_customers where id='${f.customerId}'),
    (select count(*) from public.app_cases
      where id in ('${f.caseId}','${ids.sameCustomerCaseId}')),
    (select count(*) from public.app_customer_identities
      where customer_id='${f.customerId}'),
    (select count(*) from public.app_customer_access_grants
      where customer_id='${f.customerId}'),
    (select count(*) from public.app_signup_promotions
      where case_id='${f.caseId}'),
    (select count(*) from public.app_signup_signature_evidence
      where id='${ids.signatureId}'),
    (select count(*) from public.app_case_lifecycle_events
      where case_id='${f.caseId}'),
    (select count(*) from public.app_evidence_review_rounds
      where case_id='${f.caseId}'),
    (select count(*) from public.app_evidence_review_correction_handoffs
      where case_id='${f.caseId}'),
    (select count(*) from public.app_evidence_review_customer_submissions
      where case_id='${f.caseId}'))`,
  );
}

function cleanupTimelineFixture(runtime, f, ids) {
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    delete from public.app_case_lifecycle_events
      where case_id='${ids.sameCustomerCaseId}';
    delete from public.app_cases where id='${ids.sameCustomerCaseId}';
    delete from public.app_customer_dossiers
      where id='${ids.sameCustomerDossierId}';
    commit;`,
  );
  cleanupFixture(runtime, f);
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    delete from public.app_signup_signature_evidence where id='${ids.signatureId}';
    commit;`,
  );
}

async function main() {
  const runtime = withLocalFixtureAdmin(localRuntime());
  const prefix = `customer-timeline-v1-${Date.now()}-${
    crypto.randomUUID().slice(0, 8)
  }`;
  let auth = null;
  let otherAuth = null;
  let f = null;
  let other = null;
  let ids = null;
  let proofError = null;
  let cleanupError = null;
  try {
    auth = await createAuth(runtime, prefix);
    f = fixture(prefix, auth.userId);
    ids = Object.freeze({
      intakeId: crypto.randomUUID(),
      signatureId: crypto.randomUUID(),
      mandateId: crypto.randomUUID(),
      challengeId: crypto.randomUUID(),
      roundA: crypto.randomUUID(),
      roundB: crypto.randomUUID(),
      roundCompleted: crypto.randomUUID(),
      rootA: crypto.randomUUID(),
      leafA: crypto.randomUUID(),
      leafB: crypto.randomUUID(),
      submissionA: crypto.randomUUID(),
      submissionB: crypto.randomUUID(),
      sameCustomerDossierId: crypto.randomUUID(),
      sameCustomerCaseId: crypto.randomUUID(),
      sameCustomerCaseRef: `CASE-${
        crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()
      }`,
      otherCustomerDossierId: crypto.randomUUID(),
    });
    setupFixture(runtime, f, "admin");
    grantCustomerAccess(runtime, f);
    adaptFixtureToSignedCase(runtime, f, ids);
    otherAuth = await createAuth(runtime, `${prefix}-other`);
    other = fixture(`${prefix}-other`, otherAuth.userId);
    setupFixture(runtime, other, "admin");
    grantCustomerAccess(runtime, other);
    adaptFixtureToLegacyCase(runtime, other, ids.otherCustomerDossierId);
    assertSuccess(readTimeline(runtime, other.authUserId, other.caseId));

    const cleanBeforeReview = readTimeline(runtime, f.authUserId, f.caseId);
    assertSuccess(cleanBeforeReview);
    assert(
      cleanBeforeReview.timeline.map((event) => event.event_type).join("|") ===
          "dossier_submitted" &&
        !cleanBeforeReview.timeline.some((event) =>
          event.event_type === "application_signed"
        ),
      "clean_signed_initial_events_invalid",
    );

    insertEventMatrix(runtime, f, ids);
    const matrix = readTimeline(runtime, f.authUserId, f.caseId);
    assertSuccess(matrix);
    assertOrdered(matrix.timeline);
    assert(
      matrix.timeline.map((event) => event.event_type).join("|") ===
          "review_completed|correction_submitted|correction_requested|correction_submitted|correction_requested|dossier_submitted" &&
        !matrix.timeline.some((event) =>
          event.event_type === "application_signed"
        ),
      "correction_event_matrix_invalid",
    );
    assert(
      matrix.timeline.filter((event) =>
        event.event_type === "correction_requested"
      ).length === 2,
      "superseded_handoff_not_excluded",
    );
    assert(
      matrix.timeline.filter((event) =>
        event.event_type === "correction_submitted"
      ).length === 2,
      "answered_leaf_not_retained",
    );

    for (const accountType of ["particulier", "zakelijk", "vve"]) {
      psql(
        runtime,
        `begin; set local session_replication_role=replica;
        update public.app_customers set customer_type='${accountType}' where id='${f.customerId}';
        update public.app_signup_promotions set account_type='${accountType}' where id='${f.promotionId}';
        commit;`,
      );
      assertSuccess(readTimeline(runtime, f.authUserId, f.caseId));
    }
    insertSameCustomerLegacyCase(runtime, f, ids);

    const missingActor = readTimeline(runtime, crypto.randomUUID(), f.caseId);
    const missingCase = readTimeline(
      runtime,
      f.authUserId,
      crypto.randomUUID(),
    );
    const otherCustomerCase = readTimeline(runtime, f.authUserId, other.caseId);
    const sameCustomerCaseScoped = readTimeline(
      runtime,
      f.authUserId,
      ids.sameCustomerCaseId,
    );
    assert(
      missingActor?.code === "customer_case_timeline_not_found_or_forbidden" &&
        missingCase?.code === missingActor.code &&
        otherCustomerCase?.code === missingActor.code &&
        sameCustomerCaseScoped?.code === missingActor.code &&
        missingCase.status === missingActor.status &&
        otherCustomerCase.status === missingActor.status &&
        sameCustomerCaseScoped.status === missingActor.status,
      "authority_cardinality_leak",
    );

    psql(
      runtime,
      `begin; set local session_replication_role=replica;
      update public.app_customer_access_grants set
        granted_case_id=null,
        access_basis='bound_customer_identity',
        source_class='app_customer_identity',
        source_ref='${f.customerIdentityId}'
      where auth_user_id='${f.authUserId}' and customer_id='${f.customerId}'; commit;`,
    );
    assertSuccess(readTimeline(runtime, f.authUserId, f.caseId));
    const customerWideSecond = readTimeline(
      runtime,
      f.authUserId,
      ids.sameCustomerCaseId,
    );
    assertSuccess(customerWideSecond);
    assert(
      customerWideSecond.timeline.length === 0,
      "customer_wide_case_mixed_events",
    );
    psql(
      runtime,
      `begin; update public.app_customer_dossiers
      set account_type='particulier'
      where id='${ids.sameCustomerDossierId}'; commit;`,
    );
    const accountMismatch = readTimeline(
      runtime,
      f.authUserId,
      ids.sameCustomerCaseId,
    );
    assert(
      accountMismatch?.code === missingActor.code,
      "r7_account_type_mismatch_allowed",
    );
    psql(
      runtime,
      `begin; update public.app_customer_dossiers
      set account_type='vve'
      where id='${ids.sameCustomerDossierId}'; commit;`,
    );
    psql(
      runtime,
      `insert into public.app_customer_access_grants (
      auth_user_id,customer_id,granted_case_id,access_basis,source_class,
      source_ref,request_id
    ) values ('${f.authUserId}','${other.customerId}','${other.caseId}',
      'signed_service_recipient','app_signup_promotion',
      '${f.prefix}-secondary-customer','${f.prefix}-secondary-customer');`,
    );
    const secondaryCustomerContext = readTimeline(
      runtime,
      f.authUserId,
      other.caseId,
    );
    assertSuccess(secondaryCustomerContext);
    assert(
      secondaryCustomerContext.timeline.length === 0,
      "secondary_customer_context_mixed_events",
    );
    psql(
      runtime,
      `begin; set local session_replication_role=replica;
      delete from public.app_customer_access_grants
      where auth_user_id='${f.authUserId}' and customer_id='${other.customerId}';
      commit;`,
    );
    psql(
      runtime,
      `begin; set local session_replication_role=replica;
      delete from public.app_customer_access_grants
      where auth_user_id='${f.authUserId}' and customer_id='${f.customerId}'; commit;`,
    );
    const noGrant = readTimeline(runtime, f.authUserId, f.caseId);
    assert(noGrant?.code === missingActor.code, "missing_grant_not_generic");
    psql(
      runtime,
      `insert into public.app_customer_access_grants (
      auth_user_id,customer_id,granted_case_id,access_basis,source_class,
      source_ref,request_id
    ) values ('${f.authUserId}','${f.customerId}','${f.caseId}',
      'signed_service_recipient','app_signup_promotion',
      '${f.prefix}-customer-access-restored','${f.prefix}-customer-access-restored');`,
    );

    const serialized = JSON.stringify(matrix).toLowerCase();
    assert(
      FORBIDDEN_OUTPUT_MARKERS.every((marker) => !serialized.includes(marker)),
      "timeline_privacy_marker_exposed",
    );
    assert(
      !serialized.includes(ids.signatureId.replaceAll("-", "")) &&
        !serialized.includes(ids.roundA.replaceAll("-", "")) &&
        !serialized.includes(ids.leafA.replaceAll("-", "")),
      "timeline_source_identifier_exposed",
    );

    const acl = psql(
      runtime,
      `select concat_ws('|',
      has_function_privilege('anon','public.app_customer_case_timeline_read_v1(uuid,uuid)','EXECUTE'),
      has_function_privilege('authenticated','public.app_customer_case_timeline_read_v1(uuid,uuid)','EXECUTE'),
      has_function_privilege('service_role','public.app_customer_case_timeline_read_v1(uuid,uuid)','EXECUTE'),
      has_table_privilege('anon','public.app_evidence_review_rounds','SELECT'),
      has_table_privilege('authenticated','public.app_evidence_review_rounds','SELECT'))`,
    );
    assert(acl === "f|f|t|f|f", "timeline_acl_invalid");
    for (const role of ["anon", "authenticated"]) {
      assertDirectDenied(
        runtime,
        role,
        `select public.app_customer_case_timeline_read_v1('${f.authUserId}','${f.caseId}')`,
      );
      for (const table of TIMELINE_SOURCE_TABLES) {
        assertDirectDenied(
          runtime,
          role,
          `select count(*) from public.${table}`,
        );
      }
    }

    const countsBefore = relevantState(runtime, f, ids);
    readTimeline(runtime, f.authUserId, f.caseId);
    const countsAfter = relevantState(runtime, f, ids);
    assert(countsAfter === countsBefore, "timeline_read_wrote_state");

    psql(
      runtime,
      `begin; set local session_replication_role=replica;
      insert into public.app_evidence_review_rounds (
        id,case_id,manifest_version,manifest_hash,outcome,
        reviewer_workforce_identity_id,reviewer_scope_assignment_id,
        capability_code,authorization_policy_version_id,payload_sha256,
        request_id,idempotency_key,finalized_at,recorded_at
      ) select gen_random_uuid(),'${f.caseId}','fact-review-manifest-v1',
        lpad(to_hex(series),64,'a'),'ALL_FACTS_ACCEPTED',gen_random_uuid(),
        gen_random_uuid(),'evidence.review.decide',gen_random_uuid(),'${HASH}',
        '${f.prefix}-limit-'||series,'${f.prefix}-limit-'||series,
        '2026-04-01T10:00:00.000Z'::timestamptz + series * interval '1 second',
        '2026-04-01T10:00:00.000Z'::timestamptz + series * interval '1 second'
      from generate_series(1,55) series;
      commit;`,
    );
    const limited = readTimeline(runtime, f.authUserId, f.caseId);
    assertSuccess(limited);
    assert(limited.timeline.length === 50, "timeline_not_limited_to_50");
    assertOrdered(limited.timeline);

    psql(
      runtime,
      `begin; set local session_replication_role=replica;
      update public.app_case_lifecycle_events set event_at='2026-05-01T10:00:00.000100Z'
        where case_id='${f.caseId}';
      update public.app_evidence_review_correction_handoffs set
        published_at='2026-05-01T10:00:00.000Z',
        recorded_at='2026-05-01T10:00:00.000Z'
        where id='${ids.leafB}';
      update public.app_evidence_review_customer_submissions set
        finalized_at='2026-05-01T10:00:00.000Z',
        recorded_at='2026-05-01T10:00:00.000Z'
        where id='${ids.submissionB}';
      update public.app_evidence_review_rounds set
        finalized_at='2026-05-01T10:00:00.000Z',
        recorded_at='2026-05-01T10:00:00.000Z'
        where id='${ids.roundCompleted}';
      commit;`,
    );
    const tied = readTimeline(runtime, f.authUserId, f.caseId);
    assertSuccess(tied);
    assert(
      tied.timeline.slice(0, 4).map((event) => event.event_type).join("|") ===
        "review_completed|correction_submitted|correction_requested|dossier_submitted",
      "semantic_tie_priority_invalid",
    );

    process.stdout.write(
      [
        "CUSTOMER_TIMELINE_SCHEMA=PASS",
        "CUSTOMER_TIMELINE_CLEAN_SIGNED=PASS",
        "CUSTOMER_TIMELINE_CORRECTION_LOOPS=PASS",
        "CUSTOMER_TIMELINE_SUPERSESSION=PASS",
        "CUSTOMER_TIMELINE_ACCOUNT_TYPES=PASS",
        "CUSTOMER_TIMELINE_R7_AUTHORITY=PASS",
        "CUSTOMER_TIMELINE_PRIVACY=PASS",
        "CUSTOMER_TIMELINE_ACL=PASS",
        "CUSTOMER_TIMELINE_LIMIT_ORDER=PASS",
        "CUSTOMER_TIMELINE_ZERO_WRITES=PASS",
      ].join("\n") + "\n",
    );
  } catch (error) {
    proofError = error;
  } finally {
    if (f && ids) {
      try {
        cleanupTimelineFixture(runtime, f, ids);
      } catch (error) {
        cleanupError = error;
      }
    }
    if (other) {
      try {
        psql(
          runtime,
          `begin;
          set local session_replication_role=replica;
          delete from public.app_customer_access_grants
            where auth_user_id='${f.authUserId}'
              and customer_id='${other.customerId}';
          delete from public.app_customer_dossiers
            where id='${ids.otherCustomerDossierId}';
          commit;`,
        );
        cleanupFixture(runtime, other);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (auth?.userId) {
      try {
        await deleteAuth(runtime, auth.userId);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (otherAuth?.userId) {
      try {
        await deleteAuth(runtime, otherAuth.userId);
      } catch (error) {
        cleanupError ??= error;
      }
    }
  }
  if (cleanupError) throw cleanupError;
  if (f) assert(residueCount(runtime, f) === "0", "timeline_fixture_residue");
  if (other) {
    assert(
      residueCount(runtime, other) === "0",
      "timeline_other_fixture_residue",
    );
  }
  if (ids) {
    const extraResidue = psql(
      runtime,
      `select
      (select count(*) from public.app_cases where id='${ids.sameCustomerCaseId}') +
      (select count(*) from public.app_customer_dossiers
        where id in ('${ids.sameCustomerDossierId}','${ids.otherCustomerDossierId}'))`,
    );
    assert(extraResidue === "0", "timeline_same_customer_fixture_residue");
  }
  if (proofError) throw proofError;
  process.stdout.write("CUSTOMER_TIMELINE_CLEANUP=PASS\n");
}

main().catch((error) => {
  process.stderr.write(
    `CUSTOMER_TIMELINE_PROOF=FAIL:${
      String(error?.message ?? error).replace(/[^a-zA-Z0-9:_-]/g, "_")
    }\n`,
  );
  process.exitCode = 1;
});
