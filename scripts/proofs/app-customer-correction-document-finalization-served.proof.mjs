#!/usr/bin/env node

// CUSTOMER04C3B2 LOCAL_SERVICE proof. All cases are disposable and every
// private object/database fixture is removed before the proof returns.

import {
  addSignerAuthorityDrift,
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
  localRuntime,
  pilotState,
  psql,
  publishCorrection,
  readCustomerHandoff,
  readDetail,
  readWorklist,
  relevantFingerprint,
  removeSignerAuthorityDrift,
  requestCorrectionChallenge,
  residueCount,
  scrub,
  setupFixture,
} from "./app-evidence-fact-review-round-served.proof.mjs";
import {
  grantSupersedeScope,
  supersedeCorrection,
} from "./app-correction-handoff-supersession-served.proof.mjs";
import {
  confirmUpload,
  deleteStoragePaths,
  issueUpload,
  pdf,
  putSignedUpload,
  storagePaths,
} from "./app-customer-correction-replacement-served.proof.mjs";

const VALUE_MAP = Object.freeze({
  partyName: "Proof Person Corrected",
  electricityEan: "871685900012345678",
  structuredAddress: "New Proofstraat 34, 1234 AB Proefstad",
});

async function dispose(runtime, context) {
  let cleanupError = null;
  if (context?.f) {
    try {
      await deleteStoragePaths(runtime, storagePaths(runtime, context.f));
    } catch (error) {
      cleanupError = error;
    }
    try {
      cleanupFixture(runtime, context.f);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (context?.auth?.userId) {
    try {
      await deleteAuth(runtime, context.auth.userId);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (context?.f) {
    assert(residueCount(runtime, context.f) === "0", "served_fixture_residue");
  }
  if (cleanupError) throw cleanupError;
}

async function buildHandoff(runtime, prefix, selection, requirements) {
  const auth = await createAuth(runtime, prefix);
  const f = fixture(prefix, auth.userId);
  try {
    const authority = setupFixture(runtime, f, "admin");
    grantCustomerAccess(runtime, f);
    grantPublishScope(runtime, f, authority);
    grantSupersedeScope(runtime, f, authority);
    const detail = await readDetail(runtime, f, auth.token);
    const selected = detail.reviewSubjects.filter(selection);
    assert(selected.length > 0, "selected_review_subjects_missing");
    const selectedRefs = new Set(selected.map((subject) => subject.subjectRef));
    const decisions = detail.reviewSubjects.map((subject) =>
      selectedRefs.has(subject.subjectRef)
        ? {
          subjectRef: subject.subjectRef,
          disposition: "CORRECTION_REQUIRED",
          correctionReason: "INCORRECT_INFORMATION",
          correctionInstruction: "Lever gecorrigeerd bewijs aan.",
        }
        : { subjectRef: subject.subjectRef, disposition: "ACCEPTED" }
    );
    const round = await finalize(runtime, auth.token, `${prefix}-round`, {
      caseRef: f.caseRef,
      manifestVersion: detail.reviewManifestVersion,
      manifestHash: detail.reviewManifestHash,
      decisions,
    });
    assert(round.status === 201, "review_round_finalize_failed");
    const published = await publishCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-publish`,
      round.body.roundRef,
    );
    assert(published.status === 201, "correction_publish_failed");
    const initial = await readCustomerHandoff(runtime, f, auth.token);
    assert(
      initial.status === 200 && initial.body?.handoff?.items?.length ===
          selected.length,
      "initial_customer_handoff_missing",
    );
    const replacements = initial.body.handoff.items.map((item) => ({
      itemRef: item.itemRef,
      responseRequirement: requirements(item),
    }));
    const superseded = await supersedeCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-supersede`,
      initial.body.handoff.handoffRef,
      replacements,
      "NEW_EVIDENCE_REQUIRED",
    );
    assert(superseded.status === 201, "document_handoff_supersession_failed");
    const current = await readCustomerHandoff(runtime, f, auth.token);
    assert(
      current.status === 200 && current.body?.handoff?.items?.length ===
          selected.length &&
        current.body.handoff.items.every((item) => item.replacementTarget),
      "document_handoff_projection_missing",
    );
    return { auth, f, authority, detail, selected, current: current.body };
  } catch (error) {
    await dispose(runtime, { auth, f });
    throw error;
  }
}

async function stage(runtime, context, targetRef, suffix, lines) {
  const bytes = pdf(lines);
  const issued = await issueUpload(
    runtime,
    context.f,
    context.auth.token,
    `${context.f.prefix}-${suffix}-issue`,
    targetRef,
    bytes,
  );
  assert(issued.status === 201, `${suffix}_upload_issue_failed`);
  await putSignedUpload(
    runtime,
    context.auth.token,
    issued.body.signedUploadUrl,
    bytes,
  );
  const confirmed = await confirmUpload(
    runtime,
    context.f,
    context.auth.token,
    `${context.f.prefix}-${suffix}-confirm`,
    issued.body.uploadRef,
  );
  assert(
    confirmed.status === 200 && confirmed.body?.candidateRef,
    `${suffix}_upload_confirm_failed`,
  );
  return confirmed.body;
}

function responsesFor(items, candidates, manual = {}, factKeys = []) {
  return items.map((item, index) => {
    const targetRef = item.replacementTarget?.replacementTargetRef;
    const candidateRef = candidates.get(targetRef);
    const factKey = item.factLabel === "EAN"
      ? "electricityEan"
      : item.factLabel === "Adres"
      ? "structuredAddress"
      : item.factLabel === "Naam contracthouder"
      ? "partyName"
      : factKeys[index];
    if (item.responseRequirement === "DOCUMENT_REPLACEMENT") {
      return { itemRef: item.itemRef, replacementCandidateRef: candidateRef };
    }
    return {
      itemRef: item.itemRef,
      correctedValue: manual[factKey] ?? VALUE_MAP[factKey] ??
        `Customer resolved ${factKey}`,
      replacementCandidateRef: candidateRef,
    };
  });
}

async function challenge(runtime, context, suffix, responses) {
  const result = await requestCorrectionChallenge(
    runtime,
    context.f,
    context.auth.token,
    `${context.f.prefix}-${suffix}`,
    responses,
    "Proof Person",
  );
  assert(
    result.status === 201 && result.body?.challenge_reference,
    `${suffix}_challenge_failed_${result.status}_${
      result.body?.code ?? "none"
    }`,
  );
  return result;
}

function counts(runtime, context) {
  return psql(
    runtime,
    `begin read only; select concat_ws('|',
      (select count(*) from public.app_evidence_review_customer_submissions
       where case_id='${context.f.caseId}'),
      (select count(*) from public.app_evidence_review_customer_submission_items i
       join public.app_evidence_review_customer_submissions s
         on s.id=i.submission_id where s.case_id='${context.f.caseId}'),
      (select count(*) from public.app_evidence_review_customer_submission_replacements r
       join public.app_evidence_review_customer_submissions s
         on s.id=r.submission_id where s.case_id='${context.f.caseId}'),
      (select count(*) from public.app_evidence_versions v
       join public.app_evidence_files f on f.id=v.evidence_file_id
       where f.case_id='${context.f.caseId}'
         and v.correction_replacement_candidate_id is not null),
      (select count(*) from public.app_signup_signing_snapshots s
       where s.subject_type='CUSTOMER_CORRECTION' and s.subject_ref in
         (select id from public.app_evidence_review_customer_submissions
          where case_id='${context.f.caseId}')),
      (select count(*) from public.app_evidence_review_decision_carry_forwards c
       join public.app_evidence_review_customer_submissions s
         on s.id=c.submission_id where s.case_id='${context.f.caseId}')
    ); rollback;`,
  );
}

function failureFinalize(
  runtime,
  context,
  challengeReference,
  stageName,
  suffix,
) {
  const raw = psql(
    runtime,
    `begin;
     set local enval.proof_failure_stage='${stageName}';
     select public.app_customer_correction_finalize_v2(
       '${context.f.authUserId}','${context.f.caseRef}',challenge.id,
       challenge.otp_verifier_sha256,'Proof Person',
       challenge.correction_legal_bundle_version,
       challenge.correction_legal_bundle_sha256,
       '${context.f.prefix}-${suffix}-request',
       '${context.f.prefix}-${suffix}','local')::text
     from public.app_signup_signing_challenges challenge
     where challenge.id='${challengeReference}';
     commit;`,
  );
  return JSON.parse(raw);
}

async function runValuePlusDocument(runtime, prefix) {
  const energyKeys = new Set([
    "partyName",
    "electricityEan",
    "structuredAddress",
  ]);
  const context = await buildHandoff(
    runtime,
    prefix,
    (subject) =>
      subject.evidenceKind === "energy_bill_or_contract" &&
      energyKeys.has(subject.factKey),
    () => "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  );
  try {
    const items = context.current.handoff.items;
    const energyTarget = items.find((item) =>
      item.documentLabel === "Energiedocument"
    ).replacementTarget.replacementTargetRef;
    const oldEnergy = await stage(
      runtime,
      context,
      energyTarget,
      "energy-old",
      [
        "Old candidate that will become stale",
      ],
    );
    const staleResponses = responsesFor(
      items,
      new Map([
        [energyTarget, oldEnergy.candidateRef],
      ]),
      {},
      context.selected.map((subject) => subject.factKey),
    );
    const staleChallenge = await challenge(
      runtime,
      context,
      "challenge-stale",
      staleResponses,
    );
    const staleOtp = await correctionOtp(
      runtime,
      context.f,
      staleChallenge.body.challenge_reference,
    );
    const energy = await stage(
      runtime,
      context,
      energyTarget,
      "energy-current",
      [
        "Contracthouder Proof Person Corrected",
        "Leveradres New Proofstraat 34 1234 AB Proefstad",
        "Elektriciteit 871685900012345678",
      ],
    );
    const responses = responsesFor(
      items,
      new Map([
        [energyTarget, energy.candidateRef],
      ]),
      {},
      context.selected.map((subject) => subject.factKey),
    );
    const changedCandidateConflict = await requestCorrectionChallenge(
      runtime,
      context.f,
      context.auth.token,
      `${context.f.prefix}-challenge-stale`,
      responses,
      "Proof Person",
    );
    assert(
      changedCandidateConflict.status === 409 &&
        changedCandidateConflict.body?.code === "idempotency_conflict",
      "changed_candidate_same_context_not_denied",
    );
    const staleFinalize = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      `${context.f.prefix}-stale-finalize`,
      {
        challengeReference: staleChallenge.body.challenge_reference,
        otp: staleOtp,
        typedFullName: "Proof Person",
      },
    );
    assert(
      staleFinalize.status === 409 &&
        counts(runtime, context) === "0|0|0|0|0|0",
      "stale_candidate_finalize_not_atomic_denied",
    );
    const signedChallenge = await challenge(
      runtime,
      context,
      "challenge-current",
      responses,
    );
    const challengeReference = signedChallenge.body.challenge_reference;
    const otp = await correctionOtp(runtime, context.f, challengeReference);
    addSignerAuthorityDrift(runtime, context.f);
    const authorityDenied = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      `${context.f.prefix}-authority-drift`,
      { challengeReference, otp, typedFullName: "Proof Person Changed" },
    );
    assert(
      authorityDenied.status === 409 &&
        authorityDenied.body?.code === "signer_authority_changed" &&
        counts(runtime, context) === "0|0|0|0|0|0",
      "authority_drift_not_atomic_denied",
    );
    removeSignerAuthorityDrift(runtime, context.f);
    const finalizeBody = {
      challengeReference,
      otp,
      typedFullName: "Proof Person",
    };
    const finalizeKey = `${context.f.prefix}-finalize`;
    const [a, b] = await Promise.all([
      finalizeCorrection(
        runtime,
        context.f,
        context.auth.token,
        finalizeKey,
        finalizeBody,
      ),
      finalizeCorrection(
        runtime,
        context.f,
        context.auth.token,
        finalizeKey,
        finalizeBody,
      ),
    ]);
    assert(
      [a, b].some((result) => result.status === 201) &&
        [a, b].every((result) => [200, 201].includes(result.status)),
      `concurrent_finalize_not_idempotent_${a.status}_${b.status}`,
    );
    const retried = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      finalizeKey,
      finalizeBody,
    );
    assert(
      retried.status === 200 && retried.body?.code === "already_finalized",
      "exact_finalize_retry_failed",
    );
    const finalCounts = counts(runtime, context);
    assert(
      finalCounts === "1|3|1|1|1|5",
      `final_truth_counts_invalid_${finalCounts}`,
    );
    const truth = psql(
      runtime,
      `begin read only; select concat_ws('|',
       (select count(*) from public.app_evidence_versions v
        join public.app_evidence_files f on f.id=v.evidence_file_id
        where f.case_id='${context.f.caseId}'),
       (select count(distinct r.replacement_target_ref)
        from public.app_evidence_review_customer_submission_replacements r
        join public.app_evidence_review_customer_submissions s on s.id=r.submission_id
        where s.case_id='${context.f.caseId}'),
       (select count(*) from public.app_parser_observation_envelopes o
        join public.app_customer_correction_replacement_candidates c
          on c.id=o.correction_replacement_candidate_id
        where c.case_id='${context.f.caseId}'),
       (select count(*) from public.app_evidence_review_customer_submission_items i
        join public.app_evidence_review_customer_submissions s on s.id=i.submission_id
        where s.case_id='${context.f.caseId}' and i.submitted_value is not null),
       (select count(*) from public.app_evidence_review_customer_submission_items i
        join public.app_evidence_review_customer_submissions s on s.id=i.submission_id
        where s.case_id='${context.f.caseId}' and i.action_requirement='DOCUMENT_REPLACEMENT'
          and i.submitted_value is null and i.resulting_canonical_value=i.prior_canonical_value),
       (select count(*) from public.app_customer_correction_signer_evidence_bindings b
        where b.case_id='${context.f.caseId}' and b.prepared_payload_sha256 is not null),
       public.app_evidence_review_overall_status_v1(
        '${context.f.caseId}',m.value->>'manifest_version',m.value->>'manifest_hash')
       ) from (select public.app_evidence_fact_review_manifest_v1(
         '${context.f.caseId}') value) m; rollback;`,
    );
    assert(truth === "3|1|2|3|0|1|TO_REVIEW", `final_lineage_invalid_${truth}`);
    const handoff = await readCustomerHandoff(
      runtime,
      context.f,
      context.auth.token,
    );
    const worklist = await readWorklist(runtime, context.auth.token);
    assert(
      handoff.status === 200 && handoff.body?.handoff === null &&
        worklist.body?.cases?.some((row) => row.caseRef === context.f.caseRef),
      "answered_handoff_or_worklist_reentry_invalid",
    );
  } finally {
    await dispose(runtime, context);
  }
}

async function runDocumentOnly(runtime, prefix) {
  let presentSelected = false;
  const context = await buildHandoff(
    runtime,
    prefix,
    (subject) =>
      subject.evidenceKind === "energy_bill_or_contract" &&
      subject.valueStatus === "PRESENT" && !presentSelected &&
      (presentSelected = true),
    () => "DOCUMENT_REPLACEMENT",
  );
  try {
    const item = context.current.handoff.items[0];
    const target = item.replacementTarget.replacementTargetRef;
    const candidate = await stage(runtime, context, target, "document", [
      "Contracthouder Proof Person",
    ]);
    const responses = responsesFor(
      [item],
      new Map([[target, candidate.candidateRef]]),
      {},
      context.selected.map((subject) => subject.factKey),
    );
    const issued = await challenge(
      runtime,
      context,
      "document-challenge",
      responses,
    );
    const otp = await correctionOtp(
      runtime,
      context.f,
      issued.body.challenge_reference,
    );
    const finalized = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      `${context.f.prefix}-finalize`,
      {
        challengeReference: issued.body.challenge_reference,
        otp,
        typedFullName: "Proof Person",
      },
    );
    assert(finalized.status === 201, "document_only_finalize_failed");
    const documentCounts = counts(runtime, context);
    assert(
      documentCounts === "1|1|1|1|1|6",
      `document_only_truth_invalid_${documentCounts}`,
    );
  } finally {
    await dispose(runtime, context);
  }
}

async function runParserMiss(runtime, prefix) {
  const context = await buildHandoff(
    runtime,
    prefix,
    (subject) =>
      subject.evidenceKind === "energy_bill_or_contract" &&
      subject.factKey === "partyName",
    () => "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  );
  try {
    const item = context.current.handoff.items[0];
    const target = item.replacementTarget.replacementTargetRef;
    const candidate = await stage(runtime, context, target, "parser-miss", []);
    assert(
      candidate.parserObservation?.observedFacts?.some((fact) =>
        fact.factKey === "partyName" && fact.status === "not_observed" &&
        fact.normalizedObservedValue === null
      ),
      "parser_miss_fixture_did_not_record_party_name_limitation",
    );
    const responses = responsesFor(
      [item],
      new Map([[target, candidate.candidateRef]]),
      { partyName: "Manual Customer Declaration" },
      context.selected.map((subject) => subject.factKey),
    );
    const issued = await challenge(
      runtime,
      context,
      "miss-challenge",
      responses,
    );
    const otp = await correctionOtp(
      runtime,
      context.f,
      issued.body.challenge_reference,
    );
    const finalized = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      `${context.f.prefix}-finalize`,
      {
        challengeReference: issued.body.challenge_reference,
        otp,
        typedFullName: "Proof Person",
      },
    );
    assert(finalized.status === 201, "parser_miss_manual_finalize_failed");
    const distinct = psql(
      runtime,
      `begin read only; select concat_ws('|',
       (select count(*) from public.app_evidence_review_customer_submission_items i
        join public.app_evidence_review_customer_submissions s on s.id=i.submission_id
        where s.case_id='${context.f.caseId}'
          and i.submitted_value='Manual Customer Declaration'),
       (select count(*) from public.app_parser_observation_envelopes o
        join public.app_customer_correction_replacement_candidates c
          on c.id=o.correction_replacement_candidate_id
        where c.case_id='${context.f.caseId}'
          and exists (select 1
            from jsonb_array_elements(o.envelope->'observedFacts') fact
            where fact->>'factKey'='partyName'
              and fact->>'status'='not_observed'
              and fact->'normalizedObservedValue'='null'::jsonb))
      ); rollback;`,
    );
    assert(
      distinct === "1|1",
      "parser_miss_and_customer_resolution_not_distinct",
    );
  } finally {
    await dispose(runtime, context);
  }
}

async function runFailureAtomicity(runtime, prefix) {
  let energySelected = false;
  let installationSelected = false;
  const context = await buildHandoff(
    runtime,
    prefix,
    (subject) =>
      subject.valueStatus === "PRESENT" && (
        subject.evidenceKind === "energy_bill_or_contract" &&
          !energySelected && (energySelected = true) ||
        subject.evidenceKind === "installation_invoice" &&
          !installationSelected && (installationSelected = true)
      ),
    () => "DOCUMENT_REPLACEMENT",
  );
  try {
    const items = context.current.handoff.items;
    const targets = [
      ...new Set(
        items.map((item) => item.replacementTarget.replacementTargetRef),
      ),
    ];
    assert(targets.length === 2, "atomicity_cross_document_targets_missing");
    const candidates = new Map();
    for (const [index, target] of targets.entries()) {
      const candidate = await stage(
        runtime,
        context,
        target,
        `atomic-${index}`,
        [`Atomic replacement document ${index}`],
      );
      candidates.set(target, candidate.candidateRef);
    }
    const responses = responsesFor(
      items,
      candidates,
      {},
      context.selected.map((subject) => subject.factKey),
    );
    const issued = await challenge(runtime, context, "challenge", responses);
    const stages = [
      ["CUSTOMER04C3B2_AFTER_SUBMISSION_HEADER", "after-header"],
      ["CUSTOMER04C3B2_AFTER_FIRST_PROMOTION", "mid-promotion"],
      ["CUSTOMER04C3B2_AFTER_SNAPSHOT", "after-snapshot"],
      ["CUSTOMER04C3B2_BEFORE_MANIFEST", "before-manifest"],
    ];
    for (const [stageName, suffix] of stages) {
      const result = failureFinalize(
        runtime,
        context,
        issued.body.challenge_reference,
        stageName,
        suffix,
      );
      assert(
        result.ok === false && result.code === "internal_error" &&
          counts(runtime, context) === "0|0|0|0|0|0",
        `failure_stage_not_atomic_${suffix}`,
      );
    }
    const staging = psql(
      runtime,
      `begin read only; select concat_ws('|',
       (select count(*) from public.app_customer_correction_replacement_candidates
        where case_id='${context.f.caseId}'),
       (select count(*) from public.app_parser_observation_envelopes o
        join public.app_customer_correction_replacement_candidates c
          on c.id=o.correction_replacement_candidate_id
        where c.case_id='${context.f.caseId}'));
       rollback;`,
    );
    assert(staging === "2|2", "staging_not_preserved_after_failures");
    const otp = await correctionOtp(
      runtime,
      context.f,
      issued.body.challenge_reference,
    );
    const finalized = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      `${context.f.prefix}-atomic-success`,
      {
        challengeReference: issued.body.challenge_reference,
        otp,
        typedFullName: "Proof Person",
      },
    );
    assert(
      finalized.status === 201 &&
        counts(runtime, context) === "1|2|2|2|1|0",
      "cross_document_atomic_success_invalid",
    );
  } finally {
    await dispose(runtime, context);
  }
}

async function main() {
  const runtime = localRuntime();
  const run = `customer04c3b2-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const beforePilot = pilotState(runtime);
  const beforeFingerprint = relevantFingerprint(runtime);
  await runValuePlusDocument(runtime, `${run}-combined`);
  await runDocumentOnly(runtime, `${run}-document`);
  await runParserMiss(runtime, `${run}-miss`);
  await runFailureAtomicity(runtime, `${run}-atomic`);
  assert(
    relevantFingerprint(runtime) === beforeFingerprint,
    "database_fingerprint_changed",
  );
  assert(pilotState(runtime) === beforePilot, "pilot_changed_by_c3b2_proof");
  process.stdout.write(
    [
      "SERVED_VALUE_PLUS_DOCUMENT_FLOW=PASS",
      "SERVED_DOCUMENT_ONLY_FLOW=PASS",
      "SERVED_PARSER_MISS_MANUAL_FLOW=PASS",
      "CHANGED_CANDIDATE_REQUIRES_NEW_CHALLENGE=PASS",
      "STALE_CANDIDATE_FINALIZE_DENIED=PASS",
      "AUTHORITY_DRIFT_FINALIZE_DENIED=PASS",
      "EXACT_FINALIZE_RETRY_IDEMPOTENT=PASS",
      "CONCURRENT_SINGLE_SUBMISSION=PASS",
      "CONCURRENT_SINGLE_EVIDENCE_VERSION_PER_TARGET=PASS",
      "FAILURE_AFTER_SUBMISSION_HEADER_ROLLBACK=PASS",
      "FAILURE_MID_MULTI_DOCUMENT_PROMOTION_ROLLBACK=PASS",
      "FAILURE_AFTER_SNAPSHOT_STAGE_ROLLBACK=PASS",
      "FAILURE_BEFORE_MANIFEST_COMPLETION_ROLLBACK=PASS",
      "STAGING_REMAINS_AFTER_FAILED_FINALIZE=PASS",
      "CUSTOMER04C3B2_SERVED_Q01_Q14=PASS",
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(
    `CUSTOMER04C3B2_SERVED_PROOF=FAIL:${scrub(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
});
