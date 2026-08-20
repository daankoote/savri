#!/usr/bin/env node

// LOCAL_SERVICE proof over one disposable case. REVIEW15 owns reusable local
// Auth/workforce/evidence/review fixture setup and complete cleanup.

import {
  assert,
  cleanupFixture,
  correctionOtp,
  createAuth,
  deleteAuth,
  finalize,
  finalizeCorrection,
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
  readWorklist,
  relevantFingerprint,
  requestCorrectionChallenge,
  residueCount,
  scrub,
  setupFixture,
} from "./app-evidence-fact-review-round-served.proof.mjs";

const HASH = "a".repeat(64);

function grantSupersedeScope(runtime, f, authority) {
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  const value = psql(
    runtime,
    "select public.app_workforce_case_assignment_manage_v1(" +
      "'" + authority.adminId + "','" + f.prefix + "-supersede-scope'," +
      "'" + f.prefix + "-supersede-scope','" + HASH + "','" + expires + "'," +
      "'grant','" + authority.workforceId + "'," +
      "'evidence.review.correction.supersede','" + f.caseId + "'," +
      "null,null,null,clock_timestamp(),null," +
      "'decision:" + f.prefix + ":supersede',null)->>'ok';",
  );
  assert(value === "true", "workforce_supersede_grant_failed");
}

async function supersedeCorrection(
  runtime,
  f,
  token,
  idempotencyKey,
  predecessorHandoffRef,
  itemRequirements,
  reason,
) {
  return await jsonRequest(
    runtime.apiUrl +
      "/functions/v1/api-app-evidence-review-correction-supersede",
    {
      method: "POST",
      headers: {
        apikey: runtime.anonKey,
        Authorization: "Bearer " + token,
        Origin: "http://127.0.0.1:5175",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Request-ID": idempotencyKey + "-request",
      },
      body: JSON.stringify({
        caseRef: f.caseRef,
        predecessorHandoffRef,
        itemRequirements,
        reason,
      }),
    },
  );
}

function handoffFingerprint(runtime, handoffRef) {
  return psql(
    runtime,
    "begin read only; select pg_catalog.encode(extensions.digest(" +
      "pg_catalog.to_jsonb(handoff)::text,'sha256'),'hex') " +
      "from public.app_evidence_review_correction_handoffs handoff " +
      "where handoff.handoff_reference='" + handoffRef + "'; rollback;",
  );
}

function correctionState(runtime, f) {
  return psql(
    runtime,
    "begin read only; with manifest as (" +
      "select public.app_evidence_fact_review_manifest_v1('" + f.caseId +
      "') value) select concat_ws('|'," +
      "public.app_evidence_review_overall_status_v1('" + f.caseId + "'," +
      "manifest.value->>'manifest_version',manifest.value->>'manifest_hash')," +
      "(select count(*) from public.app_evidence_review_correction_handoffs " +
      "where case_id='" + f.caseId + "')," +
      "(select count(*) from public.app_evidence_review_customer_submissions " +
      "where case_id='" + f.caseId + "')," +
      "(select count(*) from public.app_signup_signing_snapshots " +
      "where subject_type='CUSTOMER_CORRECTION' and subject_ref in " +
      "(select id from public.app_evidence_review_customer_submissions " +
      "where case_id='" + f.caseId + "'))," +
      "(select handoff_reference from public.app_evidence_review_correction_handoffs " +
      "where id=public.app_evidence_review_current_correction_handoff_v1('" +
      f.caseId +
      "',manifest.value->>'manifest_version',manifest.value->>'manifest_hash'))" +
      ") from manifest; rollback;",
  );
}

function itemRequirements(handoff, responseRequirement) {
  return handoff.items.map((item) => ({
    itemRef: item.itemRef,
    responseRequirement,
  }));
}

async function main() {
  const runtime = localRuntime();
  const prefix = "customer04c3a-" + Date.now() + "-" +
    crypto.randomUUID().slice(0, 8);
  const beforePilot = pilotState(runtime);
  const beforeFingerprint = relevantFingerprint(runtime);
  let auth = null;
  let f = null;
  let proofError = null;
  let cleanupError = null;
  try {
    auth = await createAuth(runtime, prefix);
    f = fixture(prefix, auth.userId);
    const authority = setupFixture(runtime, f, "admin");
    grantCustomerAccess(runtime, f);
    grantPublishScope(runtime, f, authority);
    grantSupersedeScope(runtime, f, authority);

    const detail = await readDetail(runtime, f, auth.token);
    const correctionIndex = detail.reviewSubjects.findIndex((subject) =>
      subject.factKey === "electricityEan"
    );
    assert(correctionIndex >= 0, "served_correction_subject_missing");
    const decisions = detail.reviewSubjects.map((subject, index) =>
      index === correctionIndex
        ? {
          subjectRef: subject.subjectRef,
          disposition: "CORRECTION_REQUIRED",
          correctionReason: "INCORRECT_INFORMATION",
          correctionInstruction: "Controleer dit bewijsgegeven.",
        }
        : { subjectRef: subject.subjectRef, disposition: "ACCEPTED" }
    );
    const finalized = await finalize(
      runtime,
      auth.token,
      prefix + "-round",
      {
        caseRef: f.caseRef,
        manifestVersion: detail.reviewManifestVersion,
        manifestHash: detail.reviewManifestHash,
        decisions,
      },
    );
    assert(
      finalized.status === 201 &&
        finalized.body?.outcome === "CORRECTIONS_REQUIRED",
      "served_round_finalize_failed",
    );

    const published = await publishCorrection(
      runtime,
      f,
      auth.token,
      prefix + "-publish",
      finalized.body.roundRef,
    );
    assert(
      published.status === 201 && published.body?.result === "PUBLISHED",
      "served_publish_failed",
    );
    const customerA = await readCustomerHandoff(runtime, f, auth.token);
    assert(
      customerA.status === 200 &&
        customerA.body?.handoff?.items?.length === 1 &&
        ["VALUE_CORRECTION", "MISSING_VALUE"].includes(
          customerA.body.handoff.items[0].responseRequirement,
        ),
      "served_customer_did_not_read_a_" + customerA.status + "_" +
        String(customerA.body?.code ?? "no_code") + "_" +
        String(customerA.body?.handoff?.items?.length ?? "no_items") + "_" +
        String(
          customerA.body?.handoff?.items?.[0]?.responseRequirement ??
            "no_requirement",
        ),
    );
    const handoffARef = customerA.body.handoff.handoffRef;
    const fingerprintA = handoffFingerprint(runtime, handoffARef);
    const responsesA = customerA.body.handoff.items.map((item) => ({
      itemRef: item.itemRef,
      correctedValue: "871234567890123457",
    }));
    const challengeA = await requestCorrectionChallenge(
      runtime,
      f,
      auth.token,
      prefix + "-challenge-a",
      responsesA,
      "Proof Person",
    );
    assert(challengeA.status === 201, "served_a_challenge_failed");
    const challengeARef = String(challengeA.body.challenge_reference);
    const otpA = await correctionOtp(runtime, f, challengeARef);

    const requirementB = customerA.body.handoff.items[0]
        .responseRequirement === "VALUE_CORRECTION"
      ? "MISSING_VALUE"
      : "VALUE_CORRECTION";
    const requirementsB = itemRequirements(
      customerA.body.handoff,
      requirementB,
    );
    const createdB = await supersedeCorrection(
      runtime,
      f,
      auth.token,
      prefix + "-supersede-b",
      handoffARef,
      requirementsB,
      "REQUIREMENT_CORRECTION",
    );
    assert(
      createdB.status === 201 && createdB.body?.result === "SUPERSEDED" &&
        createdB.body?.predecessorHandoffRef === handoffARef &&
        createdB.body?.successorHandoffRef !== handoffARef,
      "served_supersede_b_failed",
    );
    const handoffBRef = createdB.body.successorHandoffRef;
    const retryB = await supersedeCorrection(
      runtime,
      f,
      auth.token,
      prefix + "-supersede-b",
      handoffARef,
      requirementsB,
      "REQUIREMENT_CORRECTION",
    );
    assert(
      retryB.status === 201 &&
        retryB.body?.successorHandoffRef === handoffBRef &&
        handoffCount(runtime, f) === "2",
      "served_exact_retry_not_idempotent",
    );
    const changedRetry = await supersedeCorrection(
      runtime,
      f,
      auth.token,
      prefix + "-supersede-b",
      handoffARef,
      itemRequirements(
        customerA.body.handoff,
        "VALUE_PLUS_DOCUMENT_REPLACEMENT",
      ),
      "REQUIREMENT_CORRECTION",
    );
    assert(
      changedRetry.status === 409 &&
        changedRetry.body?.code === "idempotency_conflict",
      "served_changed_retry_not_denied",
    );

    const customerB = await readCustomerHandoff(runtime, f, auth.token);
    assert(
      customerB.status === 200 &&
        customerB.body?.handoff?.handoffRef === handoffBRef &&
        customerB.body.handoff.items[0].responseRequirement === requirementB &&
        handoffFingerprint(runtime, handoffARef) === fingerprintA,
      "served_customer_cutover_or_a_immutability_failed",
    );
    const challengeCountBeforeStaleIssue = psql(
      runtime,
      "select count(*) from public.app_signup_signing_challenges challenge " +
        "join public.app_evidence_review_correction_handoffs handoff " +
        "on handoff.id=challenge.correction_handoff_id " +
        "where handoff.case_id='" + f.caseId + "' " +
        "and challenge.subject_type='CUSTOMER_CORRECTION';",
    );
    const staleChallengeA = await requestCorrectionChallenge(
      runtime,
      f,
      auth.token,
      prefix + "-challenge-stale-a",
      responsesA,
      "Proof Person",
    );
    const challengeCountAfterStaleIssue = psql(
      runtime,
      "select count(*) from public.app_signup_signing_challenges challenge " +
        "join public.app_evidence_review_correction_handoffs handoff " +
        "on handoff.id=challenge.correction_handoff_id " +
        "where handoff.case_id='" + f.caseId + "' " +
        "and challenge.subject_type='CUSTOMER_CORRECTION';",
    );
    assert(
      [400, 409].includes(staleChallengeA.status) &&
        challengeCountAfterStaleIssue === challengeCountBeforeStaleIssue,
      "served_stale_a_challenge_not_denied",
    );
    const staleA = await finalizeCorrection(
      runtime,
      f,
      auth.token,
      prefix + "-finalize-stale-a",
      {
        challengeReference: challengeARef,
        otp: otpA,
        typedFullName: "Proof Person",
      },
    );
    assert(
      staleA.status === 409 &&
        [
          "stale_correction_context",
          "current_unanswered_handoff_missing",
        ].includes(staleA.body?.code) &&
        correctionState(runtime, f).split("|").slice(0, 4).join("|") ===
          "WAITING_CUSTOMER|2|0|0",
      "served_stale_a_finalize_not_denied",
    );

    const responsesB = customerB.body.handoff.items.map((item) => ({
      itemRef: item.itemRef,
      correctedValue: "871234567890123457",
    }));
    const challengeB = await requestCorrectionChallenge(
      runtime,
      f,
      auth.token,
      prefix + "-challenge-b",
      responsesB,
      "Proof Person",
    );
    assert(challengeB.status === 201, "served_b_cannot_begin_signing");

    const requirementsC = itemRequirements(
      customerB.body.handoff,
      "VALUE_CORRECTION",
    );
    const candidatesC = await Promise.all([
      supersedeCorrection(
        runtime,
        f,
        auth.token,
        prefix + "-supersede-c-1",
        handoffBRef,
        requirementsC,
        "PROCESS_CORRECTION",
      ),
      supersedeCorrection(
        runtime,
        f,
        auth.token,
        prefix + "-supersede-c-2",
        handoffBRef,
        requirementsC,
        "PROCESS_CORRECTION",
      ),
    ]);
    const winnerC = candidatesC.find((result) => result.status === 201);
    const deniedSibling = candidatesC.find((result) => result.status === 409);
    assert(
      winnerC?.body?.result === "SUPERSEDED" && deniedSibling &&
        handoffCount(runtime, f) === "3",
      "served_concurrent_supersession_branched",
    );
    const handoffCRef = winnerC.body.successorHandoffRef;
    const staleBranch = await supersedeCorrection(
      runtime,
      f,
      auth.token,
      prefix + "-stale-branch-a",
      handoffARef,
      requirementsB,
      "REQUIREMENT_CORRECTION",
    );
    const customerC = await readCustomerHandoff(runtime, f, auth.token);
    const worklist = await readWorklist(runtime, auth.token);
    assert(
      staleBranch.status === 409 &&
        staleBranch.body?.code === "correction_handoff_not_current" &&
        customerC.status === 200 &&
        customerC.body?.handoff?.handoffRef === handoffCRef &&
        correctionState(runtime, f) ===
          "WAITING_CUSTOMER|3|0|0|" + handoffCRef &&
        worklist.status === 200 &&
        !worklist.body?.cases?.some((row) => row.caseRef === f.caseRef),
      "served_chain_tail_status_or_worklist_failed",
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
    if (auth) {
      try {
        await deleteAuth(runtime, auth.userId);
      } catch (error) {
        cleanupError ??= error;
      }
    }
  }

  if (cleanupError) throw cleanupError;
  assert(!f || residueCount(runtime, f) === "0", "served_fixture_residue");
  assert(
    relevantFingerprint(runtime) === beforeFingerprint,
    "database_fingerprint_changed",
  );
  assert(pilotState(runtime) === beforePilot, "pilot_changed_by_proof");
  if (proofError) throw proofError;

  process.stdout.write(
    [
      "SERVED_SUPERSESSION_FLOW=PASS",
      "SERVED_ORIGINAL_HANDOFF_UNCHANGED=PASS",
      "SERVED_CUSTOMER_READ_CUTOVER=PASS",
      "SERVED_STALE_CHALLENGE_DENIED=PASS",
      "SERVED_STALE_FINALIZE_DENIED=PASS",
      "SERVED_SUPERSESSION_IDEMPOTENT=PASS",
      "SERVED_SUPERSESSION_CONCURRENT_SINGLE_TAIL=PASS",
      "SERVED_SUPERSESSION_CHAIN=PASS",
      "SERVED_SUPERSESSION_WAITING_CUSTOMER=PASS",
      "SERVED_SUPERSESSION_WORKLIST_EXCLUDED=PASS",
      "SERVED_SUPERSESSION_PILOT_UNCHANGED=PASS",
      "CUSTOMER04C3A_SERVED_Q01_Q11=PASS",
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(
    "CUSTOMER04C3A_SERVED_PROOF=FAIL:" +
      scrub(error?.message ?? error) + "\n",
  );
  process.exitCode = 1;
});
