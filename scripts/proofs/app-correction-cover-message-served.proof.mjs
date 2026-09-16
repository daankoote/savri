#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assert,
  cleanupFixture,
  createAuth,
  deleteAuth,
  finalize,
  fixture,
  grantCustomerAccess,
  grantPublishScope,
  handoffCount,
  jsonRequest,
  localRuntime,
  pilotState,
  psql,
  publishCorrection,
  readCustomerHandoff,
  readDetail,
  relevantFingerprint,
  residueCount,
  scrub,
  setupFixture,
} from "./app-evidence-fact-review-round-served.proof.mjs";

const COVER_MESSAGE = "Controleer regel één.\nCorrigeer regel twee.";

function mailState(runtime) {
  return psql(runtime, `begin read only; select concat_ws('|',
    (select count(*) from public.app_workflow_email_intents),
    (select count(*) from public.app_workflow_email_deliveries),
    (select count(*) from public.app_workflow_email_delivery_attempts),
    (select count(*) from public.app_workflow_email_dispatches)); rollback;`);
}

function businessState(runtime, f) {
  return psql(runtime, `begin read only; select concat_ws('|',
    (select count(*) from public.app_evidence_review_correction_handoffs
      where case_id='${f.caseId}'),
    (select count(*) from public.app_audit_events
      where request_id like '${f.prefix}-invalid-%'),
    (select count(*) from public.app_idempotency_keys
      where key like '${f.prefix}-invalid-%')); rollback;`);
}

async function publishRaw(runtime, token, key, body) {
  return await jsonRequest(
    `${runtime.apiUrl}/functions/v1/api-app-evidence-review-correction-publish`,
    {
      method: "POST",
      headers: {
        apikey: runtime.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    },
  );
}

async function main() {
  const runtime = localRuntime();
  const prefix = `correction-cover-served-${Date.now()}-${
    crypto.randomUUID().slice(0, 8)
  }`;
  const beforeFingerprint = relevantFingerprint(runtime);
  const beforePilot = pilotState(runtime);
  const beforeMail = mailState(runtime);
  let auth = null;
  let f = null;
  let proofError = null;
  let cleanupError = null;
  try {
    auth = await createAuth(runtime, prefix);
    f = fixture(prefix, auth.userId);
    const authority = setupFixture(runtime, f, "admin");
    grantPublishScope(runtime, f, authority);
    grantCustomerAccess(runtime, f);

    const detail = await readDetail(runtime, f, auth.token);
    const correctionIndex = detail.reviewSubjects.findIndex((subject) =>
      subject.factKey === "electricityEan"
    );
    assert(correctionIndex >= 0, "cover_subject_missing");
    const decisions = detail.reviewSubjects.map((subject, index) =>
      index === correctionIndex || subject.valueStatus === "REQUIRED_MISSING"
        ? {
          subjectRef: subject.subjectRef,
          disposition: "CORRECTION_REQUIRED",
          correctionReason: "INCORRECT_INFORMATION",
          correctionInstruction: "Controleer dit bewijsgegeven.",
        }
        : { subjectRef: subject.subjectRef, disposition: "ACCEPTED" }
    );
    const finalized = await finalize(runtime, auth.token, `${prefix}-round`, {
      caseRef: f.caseRef,
      manifestVersion: detail.reviewManifestVersion,
      manifestHash: detail.reviewManifestHash,
      decisions,
    });
    assert(finalized.status === 201, "cover_round_finalize_failed");

    const invalidState = businessState(runtime, f);
    const base = { caseRef: f.caseRef, roundRef: finalized.body.roundRef };
    const invalidBodies = [
      base,
      { ...base, coverMessage: null },
      { ...base, coverMessage: 42 },
      { ...base, coverMessage: "   " },
      { ...base, coverMessage: "Regel\rtekst" },
      { ...base, coverMessage: "Regel\u0007tekst" },
      { ...base, coverMessage: "a".repeat(1001) },
    ];
    for (const [index, body] of invalidBodies.entries()) {
      const response = await publishRaw(
        runtime,
        auth.token,
        `${prefix}-invalid-${index}`,
        body,
      );
      assert(
        response.status === 400 && response.body?.code === "invalid_input" &&
          businessState(runtime, f) === invalidState,
        `invalid_cover_wrote_${index}_${response.status}_${
          response.body?.code ?? "none"
        }`,
      );
    }

    const publishKey = `${prefix}-publish`;
    const published = await publishCorrection(
      runtime,
      f,
      auth.token,
      publishKey,
      finalized.body.roundRef,
      COVER_MESSAGE,
    );
    assert(
      published.status === 201 && published.body?.result === "PUBLISHED" &&
        handoffCount(runtime, f) === "1",
      "valid_cover_publish_failed",
    );

    const snapshot = JSON.parse(psql(runtime, `begin read only;
      select jsonb_build_object(
        'schema',handoff.correction_bundle->>'schema_version',
        'publication_schema',handoff.correction_bundle#>>'{customer_publication,schema_version}',
        'cover',handoff.correction_bundle#>>'{customer_publication,cover_message}',
        'bundle_hash_valid',handoff.bundle_sha256=encode(
          extensions.digest(handoff.correction_bundle::text,'sha256'),'hex'),
        'projected_cover',public.app_correction_customer_publication_snapshot_v1(
          handoff.id)#>>'{snapshot,cover_message}',
        'projected_hash',public.app_correction_customer_publication_snapshot_v1(
          handoff.id)->>'snapshot_sha256',
        'expected_hash',encode(extensions.digest(
          (handoff.correction_bundle->'customer_publication')::text,'sha256'
        ),'hex')
      )::text
      from public.app_evidence_review_correction_handoffs handoff
      where handoff.case_id='${f.caseId}'; rollback;`));
    assert(
      snapshot.schema === "evidence-review-correction-handoff-bundle-v3" &&
        snapshot.publication_schema === "correction-customer-publication-v1" &&
        snapshot.cover === COVER_MESSAGE &&
        snapshot.bundle_hash_valid === true &&
        snapshot.projected_cover === COVER_MESSAGE &&
        snapshot.projected_hash === snapshot.expected_hash &&
        /^[0-9a-f]{64}$/.test(snapshot.projected_hash),
      "immutable_snapshot_or_hash_invalid",
    );

    const customerRead = await readCustomerHandoff(runtime, f, auth.token);
    assert(
      customerRead.status === 200 &&
        customerRead.body?.handoff?.coverMessage === COVER_MESSAGE &&
        !JSON.stringify(customerRead.body).includes("snapshotSha") &&
        !JSON.stringify(customerRead.body).includes("bundleSha"),
      "portal_snapshot_not_customer_safe",
    );

    const replay = await publishCorrection(
      runtime,
      f,
      auth.token,
      publishKey,
      finalized.body.roundRef,
      COVER_MESSAGE,
    );
    const changedReplay = await publishCorrection(
      runtime,
      f,
      auth.token,
      publishKey,
      finalized.body.roundRef,
      "Ander bericht.",
    );
    const conflictingPublish = await publishCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-publish-conflict`,
      finalized.body.roundRef,
      "Ander bericht.",
    );
    assert(
      [200, 201].includes(replay.status) &&
        replay.body?.handoffRef === published.body?.handoffRef &&
        changedReplay.status === 409 &&
        changedReplay.body?.code === "idempotency_conflict" &&
        conflictingPublish.status === 409 &&
        conflictingPublish.body?.code === "correction_handoff_conflict" &&
        handoffCount(runtime, f) === "1",
      "cover_replay_or_conflict_invalid",
    );

    const legacy = psql(runtime, `begin;
      set local session_replication_role=replica;
      update public.app_evidence_review_correction_handoffs handoff set
        correction_bundle=(handoff.correction_bundle-'customer_publication') ||
          jsonb_build_object('schema_version','evidence-review-correction-handoff-bundle-v1'),
        bundle_sha256=encode(extensions.digest(((handoff.correction_bundle-
          'customer_publication') || jsonb_build_object('schema_version',
          'evidence-review-correction-handoff-bundle-v1'))::text,'sha256'),'hex')
      where handoff.case_id='${f.caseId}';
      select concat_ws('|',
        public.app_correction_customer_publication_snapshot_v1(id)->>'ok',
        (public.app_correction_customer_publication_snapshot_v1(id)->'snapshot') = 'null'::jsonb,
        (public.app_correction_customer_publication_snapshot_v1(id)->'snapshot_sha256') = 'null'::jsonb
      ) from public.app_evidence_review_correction_handoffs
      where case_id='${f.caseId}';
      update public.app_evidence_review_correction_handoffs handoff set
        correction_bundle=jsonb_set(handoff.correction_bundle,'{schema_version}',
          to_jsonb('evidence-review-correction-handoff-bundle-v2'::text)),
        bundle_sha256=encode(extensions.digest(jsonb_set(handoff.correction_bundle,
          '{schema_version}',to_jsonb('evidence-review-correction-handoff-bundle-v2'::text))::text,
          'sha256'),'hex')
      where handoff.case_id='${f.caseId}';
      select concat_ws('|',
        public.app_correction_customer_publication_snapshot_v1(id)->>'ok',
        (public.app_correction_customer_publication_snapshot_v1(id)->'snapshot') = 'null'::jsonb,
        (public.app_correction_customer_publication_snapshot_v1(id)->'snapshot_sha256') = 'null'::jsonb
      ) from public.app_evidence_review_correction_handoffs
      where case_id='${f.caseId}'; rollback;`);
    assert(
      legacy.split("\n").join("|") === "true|t|t|true|t|t",
      `legacy_null_projection_invalid_${legacy.split("\n").join("_")}`,
    );

    const acl = psql(runtime, `begin read only; select concat_ws('|',
      (select relrowsecurity from pg_class
        where oid='public.app_evidence_review_correction_handoffs'::regclass),
      not has_table_privilege('anon','public.app_evidence_review_correction_handoffs','SELECT'),
      not has_table_privilege('authenticated','public.app_evidence_review_correction_handoffs','SELECT'),
      not has_function_privilege('service_role','public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)','EXECUTE'),
      has_function_privilege('service_role','public.app_evidence_review_correction_publish_v2(uuid,text,uuid,text,text,text,text,timestamptz)','EXECUTE'),
      not has_function_privilege('anon','public.app_evidence_review_correction_publish_v2(uuid,text,uuid,text,text,text,text,timestamptz)','EXECUTE'),
      not has_function_privilege('authenticated','public.app_evidence_review_correction_publish_v2(uuid,text,uuid,text,text,text,text,timestamptz)','EXECUTE'),
      not has_function_privilege('anon','public.app_customer_correction_handoff_read_v6(uuid,text)','EXECUTE'),
      not has_function_privilege('authenticated','public.app_customer_correction_handoff_read_v6(uuid,text)','EXECUTE'),
      not has_function_privilege('service_role','public.app_correction_customer_publication_snapshot_v1(uuid)','EXECUTE')
    ); rollback;`);
    assert(acl === "t|t|t|t|t|t|t|t|t|t", `cover_acl_invalid_${acl}`);
    assert(mailState(runtime) === beforeMail, "correction_publish_created_mail");
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
  if (f) assert(residueCount(runtime, f) === "0", "cover_fixture_residue");
  assert(relevantFingerprint(runtime) === beforeFingerprint, "cover_database_fingerprint_changed");
  assert(pilotState(runtime) === beforePilot, "cover_pilot_changed");
  assert(mailState(runtime) === beforeMail, "cover_mail_state_changed");
  if (proofError) throw proofError;
  process.stdout.write([
    "CORRECTION_COVER_ACTIVE_SCHEMA=PASS",
    "CORRECTION_COVER_INVALID_ZERO_WRITE=PASS",
    "CORRECTION_COVER_SNAPSHOT_HASH=PASS",
    "CORRECTION_COVER_PORTAL_PRIVATE_PARITY=PASS",
    "CORRECTION_COVER_REPLAY_CONFLICT=PASS",
    "CORRECTION_COVER_LEGACY_NULL=PASS",
    "CORRECTION_COVER_RLS_ACL_DENIALS=PASS",
    "CORRECTION_COVER_MAIL_ZERO=PASS",
    "CORRECTION_COVER_FIXTURE_CLEANUP=PASS",
  ].join("\n") + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`CORRECTION_COVER_SERVED=FAIL:${scrub(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
