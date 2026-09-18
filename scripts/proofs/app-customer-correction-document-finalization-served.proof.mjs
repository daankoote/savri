#!/usr/bin/env node

// Shared CUSTOMER04C3B2 LOCAL_SERVICE harness. The four owning entrypoints
// select one bounded responsibility; direct execution retains aggregate
// compatibility. Every fixture and private object is removed before return.

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

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
  HASH,
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
  structuredAddress: "New Proofstraat 34, 1234AB Proefstad",
  chargerBrand: "Proof Brand",
  midNumber: "123456789",
});

const STALE_ENERGY_VALUE_MAP = Object.freeze({
  partyName: "Old Proof Person",
  structuredAddress: "Old Proofstraat 1, 1234AB Proefstad",
  electricityEan: "871685900012345679",
});

const PRIMARY_DOCUMENT_BY_FACT = Object.freeze({
  partyName: "energy_bill_or_contract",
  structuredAddress: "energy_bill_or_contract",
  electricityEan: "energy_bill_or_contract",
  energySupplier: "energy_bill_or_contract",
  chargerBrand: "installation_invoice",
  chargerModel: "installation_invoice",
  midNumber: "installation_invoice",
  serialNumber: "installation_invoice",
});

const DOCUMENT_KIND_BY_LABEL = Object.freeze({
  Energiedocument: "energy_bill_or_contract",
  Installatiefactuur: "installation_invoice",
});

const TARGET_SCOPE_PLAN = Object.freeze({
  upload_candidate_energy: Object.freeze({
    documentLabel: "Energiedocument",
    observedValues: Object.freeze({ partyName: "Proof Person" }),
    missingFactKeys: Object.freeze([]),
  }),
  challenge_replay_energy: Object.freeze({
    documentLabel: "Energiedocument",
    observedValues: Object.freeze({ partyName: VALUE_MAP.partyName }),
    missingFactKeys: Object.freeze([]),
  }),
  challenge_replay_invoice: Object.freeze({
    documentLabel: "Installatiefactuur",
    observedValues: Object.freeze({ midNumber: VALUE_MAP.midNumber }),
    missingFactKeys: Object.freeze([]),
  }),
  combined_invoice: Object.freeze({
    documentLabel: "Installatiefactuur",
    observedValues: Object.freeze({ midNumber: VALUE_MAP.midNumber }),
    missingFactKeys: Object.freeze([]),
  }),
  combined_stale_energy: Object.freeze({
    documentLabel: "Energiedocument",
    observedValues: Object.freeze({ ...STALE_ENERGY_VALUE_MAP }),
    missingFactKeys: Object.freeze([]),
  }),
  combined_current_energy: Object.freeze({
    documentLabel: "Energiedocument",
    observedValues: Object.freeze({
      partyName: VALUE_MAP.partyName,
      structuredAddress: VALUE_MAP.structuredAddress,
      electricityEan: VALUE_MAP.electricityEan,
    }),
    missingFactKeys: Object.freeze([]),
  }),
  document_only_energy: Object.freeze({
    documentLabel: "Energiedocument",
    observedValues: Object.freeze({ partyName: "Proof Person" }),
    missingFactKeys: Object.freeze([]),
  }),
  document_only_invoice: Object.freeze({
    documentLabel: "Installatiefactuur",
    observedValues: Object.freeze({ midNumber: VALUE_MAP.midNumber }),
    missingFactKeys: Object.freeze([]),
  }),
  parser_miss_energy: Object.freeze({
    documentLabel: "Energiedocument",
    observedValues: Object.freeze({}),
    missingFactKeys: Object.freeze(["partyName"]),
  }),
  parser_miss_invoice: Object.freeze({
    documentLabel: "Installatiefactuur",
    observedValues: Object.freeze({ midNumber: VALUE_MAP.midNumber }),
    missingFactKeys: Object.freeze([]),
  }),
  atomic_energy: Object.freeze({
    documentLabel: "Energiedocument",
    observedValues: Object.freeze({ partyName: "Proof Person" }),
    missingFactKeys: Object.freeze([]),
  }),
  atomic_invoice: Object.freeze({
    documentLabel: "Installatiefactuur",
    observedValues: Object.freeze({
      chargerBrand: VALUE_MAP.chargerBrand,
      midNumber: VALUE_MAP.midNumber,
    }),
    missingFactKeys: Object.freeze([]),
  }),
});

const CURRENT_ENERGY_DOCUMENT_LINES = Object.freeze([
  "Energieleverancier:Proof Supplier",
  "Contracthouder:Proof Person",
  "Leveradres:Proof Address",
  "Elektriciteit 871234567890123456",
]);

const CURRENT_INSTALLATION_DOCUMENT_LINES = Object.freeze([
  "Merk:Proof Brand",
  "Model:Proof Model",
  "MID:123456789",
  "Serienummer:PROOF-SERIAL",
]);

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function storageObjectResidue(runtime, paths) {
  if (paths.length === 0) return "0";
  return psql(
    runtime,
    `begin read only; select count(*) from storage.objects
     where bucket_id='app-documents'
       and name in (${paths.map(sqlLiteral).join(",")}); rollback;`,
  );
}

async function dispose(runtime, context) {
  let cleanupError = null;
  if (context?.f) {
    const paths = storagePaths(runtime, context.f);
    try {
      await deleteStoragePaths(runtime, paths);
      assert(
        storageObjectResidue(runtime, paths) === "0",
        "served_storage_residue",
      );
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

function assertNamedState(phase, actual, expected) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    assert(
      actual[field] === expectedValue,
      `${phase}_${field}_expected_${expectedValue}_actual_${actual[field]}`,
    );
  }
}

function reviewRoundWriteState(runtime, f, idempotencyKey) {
  return JSON.parse(psql(
    runtime,
    `begin read only; select pg_catalog.jsonb_build_object(
      'roundCount', (select count(*) from public.app_evidence_review_rounds
        where case_id='${f.caseId}'),
      'decisionCount', (select count(*)
        from public.app_evidence_review_round_subject_decisions d
        join public.app_evidence_review_rounds r on r.id=d.round_id
        where r.case_id='${f.caseId}'),
      'auditCount', (select count(*) from public.app_audit_events
        where scope_id='${f.caseId}'
          and event_type='evidence_fact_review_round_finalized'),
      'idempotencyCount', (select count(*) from public.app_idempotency_keys
        where key='${idempotencyKey}')
    )::text; rollback;`,
  ));
}

function alignDocumentAuthorityFixture(runtime, f) {
  psql(
    runtime,
    `begin;
    set local session_replication_role = replica;
    do $$
    declare changed integer;
    begin
      update public.app_locations
      set created_from_request_id='${f.prefix}-promotion:location:location-1'
      where id='${f.locationId}'
        and created_by_actor_ref='proof:${f.prefix}';
      get diagnostics changed = row_count;
      if changed <> 1 then
        raise exception 'proof location authority alignment changed';
      end if;
      update public.app_chargers
      set source_ref_sha256=pg_catalog.encode(
        extensions.digest('charger-1','sha256'),'hex'
      )
      where id='${f.chargerId}'
        and created_by_actor_ref='proof:${f.prefix}';
      get diagnostics changed = row_count;
      if changed <> 1 then
        raise exception 'proof charger authority alignment changed';
      end if;
    end;
    $$;
    commit;`,
  );
}

async function buildHandoff(
  runtime,
  prefix,
  selection,
  requirements,
  { proveInvalidRequiredMissing = false } = {},
) {
  const auth = await createAuth(runtime, prefix);
  const f = fixture(prefix, auth.userId);
  try {
    const authority = setupFixture(runtime, f, "admin");
    alignDocumentAuthorityFixture(runtime, f);
    grantCustomerAccess(runtime, f);
    grantPublishScope(runtime, f, authority);
    grantSupersedeScope(runtime, f, authority);
    const detail = await readDetail(runtime, f, auth.token);
    const primarySubjects = detail.reviewSubjects.filter((subject) =>
      PRIMARY_DOCUMENT_BY_FACT[subject.factKey] === subject.evidenceKind
    );
    assert(
      primarySubjects.length === 8 &&
        new Set(primarySubjects.map((subject) => subject.factKey)).size === 8,
      "primary_review_subject_fixture_invalid",
    );
    const requiredMissing = detail.reviewSubjects.filter((subject) =>
      subject.valueStatus === "REQUIRED_MISSING"
    );
    assert(
      requiredMissing.length === 1 &&
        requiredMissing[0].factKey === "midNumber" &&
        requiredMissing[0].evidenceKind === "installation_invoice",
      "required_missing_subject_fixture_invalid",
    );
    const requiredMissingRefs = new Set(
      requiredMissing.map((subject) => subject.subjectRef),
    );
    const requiredMissingFactKeys = new Set(
      requiredMissing.map((subject) => subject.factKey),
    );
    const selected = detail.reviewSubjects.filter((subject) =>
      selection(subject) || requiredMissingRefs.has(subject.subjectRef)
    );
    assert(selected.length > 0, "selected_review_subjects_missing");
    const selectedRefs = new Set(selected.map((subject) => subject.subjectRef));
    const decisions = detail.reviewSubjects.map((subject) =>
      selectedRefs.has(subject.subjectRef)
        ? {
          subjectRef: subject.subjectRef,
          disposition: "CORRECTION_REQUIRED",
          correctionReason: requiredMissingRefs.has(subject.subjectRef)
            ? "MISSING_INFORMATION"
            : "INCORRECT_INFORMATION",
          correctionInstruction: "Lever gecorrigeerd bewijs aan.",
        }
        : { subjectRef: subject.subjectRef, disposition: "ACCEPTED" }
    );
    assert(
      requiredMissing.every((subject) =>
        decisions.some((decision) =>
          decision.subjectRef === subject.subjectRef &&
          decision.disposition === "CORRECTION_REQUIRED"
        )
      ),
      "required_missing_not_correction_required",
    );
    if (proveInvalidRequiredMissing) {
      const invalidRef = requiredMissing[0].subjectRef;
      const invalidKey = `${prefix}-required-missing-invalid`;
      const invalidDecisions = decisions.map((decision) =>
        decision.subjectRef === invalidRef
          ? { subjectRef: decision.subjectRef, disposition: "ACCEPTED" }
          : decision
      );
      const before = reviewRoundWriteState(runtime, f, invalidKey);
      const beforeFingerprint = relevantFingerprint(runtime);
      const invalid = await finalize(runtime, auth.token, invalidKey, {
        caseRef: f.caseRef,
        manifestVersion: detail.reviewManifestVersion,
        manifestHash: detail.reviewManifestHash,
        decisions: invalidDecisions,
      });
      const after = reviewRoundWriteState(runtime, f, invalidKey);
      const afterFingerprint = relevantFingerprint(runtime);
      assertNamedState("required_missing_invalid_before", before, {
        roundCount: 0,
        decisionCount: 0,
        auditCount: 0,
        idempotencyCount: 0,
      });
      assertNamedState("required_missing_invalid_after", after, before);
      assert(
        afterFingerprint === beforeFingerprint &&
          invalid.status === 500 && invalid.body?.code === "internal_error",
        "required_missing_accepted_not_zero_write_denied",
      );
    }
    const round = await finalize(runtime, auth.token, `${prefix}-round`, {
      caseRef: f.caseRef,
      manifestVersion: detail.reviewManifestVersion,
      manifestHash: detail.reviewManifestHash,
      decisions,
    });
    if (round.status !== 201) {
      const serverDiagnostic = psql(
        runtime,
        `begin read only; select concat_ws('|',
          coalesce(response_status::text,'none'),
          coalesce(response_body->>'code','none'))
        from public.app_idempotency_keys
        where key='${prefix}-round'
        order by created_at desc limit 1; rollback;`,
      ) || "none|none";
      throw new Error(
        `review_round_finalize_failed_http_${round.status}_code_${
          round.body?.code ?? "none"
        }_server_${serverDiagnostic}`,
      );
    }
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
          selected.length &&
        requiredMissing.every((subject) =>
          initial.body.handoff.items.some((item) =>
            item.factKey === subject.factKey
          )
        ),
      "initial_customer_handoff_missing",
    );
    const replacements = initial.body.handoff.items.map((item) => ({
      itemRef: item.itemRef,
      responseRequirement: requiredMissingFactKeys.has(item.factKey)
        ? "VALUE_PLUS_DOCUMENT_REPLACEMENT"
        : requirements(item),
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
        current.body.handoff.items.every((item) => item.replacementTarget) &&
        current.body.handoff.items.every((item) =>
          !requiredMissingFactKeys.has(item.factKey) ||
          item.responseRequirement === "VALUE_PLUS_DOCUMENT_REPLACEMENT"
        ),
      "document_handoff_projection_missing",
    );
    return {
      auth,
      f,
      authority,
      detail,
      selected,
      requiredMissingFactKeys,
      current: current.body,
    };
  } catch (error) {
    await dispose(runtime, { auth, f });
    throw error;
  }
}

async function stage(runtime, context, phase, targetRef, suffix, lines) {
  const bytes = pdf(lines);
  const issueKey = `${context.f.prefix}-${suffix}-issue`;
  const confirmKey = `${context.f.prefix}-${suffix}-confirm`;
  const issued = await issueUpload(
    runtime,
    context.f,
    context.auth.token,
    issueKey,
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
    confirmKey,
    issued.body.uploadRef,
  );
  assert(
    confirmed.status === 200 && confirmed.body?.candidateRef,
    `${suffix}_upload_confirm_failed`,
  );
  const staged = Object.freeze({
    ...confirmed.body,
    proofOwner: Object.freeze({
      issueKey,
      confirmKey,
      uploadRef: issued.body.uploadRef,
      replacementTargetRef: targetRef,
      byteSha256: createHash("sha256").update(bytes).digest("hex"),
    }),
  });
  assertTargetPhaseIdempotency(runtime, context, phase, staged, null, null, {
    challengeCount: 0,
    deliveredChallengeCount: 0,
    replacedChallengeCount: 0,
    consumedChallengeCount: 0,
    signerChallengeBindingCount: 0,
    resolutionChallengeBindingCount: 0,
    submissionCount: 0,
    signerEvidenceBindingCount: 0,
    submissionItemCount: 0,
    submissionReplacementCount: 0,
    factResolutionCount: 0,
  });
  return staged;
}

function responsesFor(items, candidates, manual = {}) {
  return items.map((item) => {
    const targetRef = item.replacementTarget?.replacementTargetRef;
    const candidateRef = candidates.get(targetRef);
    const factKey = item.factKey;
    assert(targetRef && candidateRef, `candidate_missing_${factKey}`);
    if (item.responseRequirement === "DOCUMENT_REPLACEMENT") {
      return { itemRef: item.itemRef, replacementCandidateRef: candidateRef };
    }
    const correctedValue = manual[factKey] ?? VALUE_MAP[factKey];
    assert(
      typeof correctedValue === "string" && correctedValue.length > 0,
      `corrected_value_missing_${factKey}`,
    );
    return {
      itemRef: item.itemRef,
      correctedValue,
      replacementCandidateRef: candidateRef,
    };
  });
}

function factResolutionsFor(items, candidates, transcriptionFactKeys = []) {
  const transcription = new Set(transcriptionFactKeys);
  return items.filter((item) =>
    item.responseRequirement === "VALUE_PLUS_DOCUMENT_REPLACEMENT"
  ).map((item) => {
    const targetRef = item.replacementTarget?.replacementTargetRef;
    const candidateRef = candidates.get(targetRef);
    assert(
      targetRef && candidateRef,
      `resolution_candidate_missing_${item.factKey}`,
    );
    return transcription.has(item.factKey)
      ? {
        itemRefs: [item.itemRef],
        resolutionType: "DOCUMENT_TRANSCRIPTION",
        sources: [],
        transcriptionCandidateRef: candidateRef,
      }
      : {
        itemRefs: [item.itemRef],
        resolutionType: "SOURCE_CONFIRMED",
        sources: [{
          candidateRef,
          relationship: "direct",
          selected: false,
        }],
      };
  });
}

function targetScopeFactKeys(plan) {
  return [
    ...Object.keys(plan.observedValues),
    ...plan.missingFactKeys,
  ].sort();
}

function assertStaticTargetScopePlan() {
  assert(
    Object.keys(TARGET_SCOPE_PLAN).length === 12,
    "target_scope_phase_count_invalid",
  );
  for (const [phase, plan] of Object.entries(TARGET_SCOPE_PLAN)) {
    const factKeys = targetScopeFactKeys(plan);
    assert(factKeys.length > 0, `${phase}_target_scope_empty`);
    assert(
      new Set(factKeys).size === factKeys.length,
      `${phase}_target_scope_duplicate_fact`,
    );
    const documentKind = DOCUMENT_KIND_BY_LABEL[plan.documentLabel];
    assert(documentKind, `${phase}_document_label_invalid`);
    for (const factKey of factKeys) {
      assert(
        PRIMARY_DOCUMENT_BY_FACT[factKey] === documentKind,
        `${phase}_${factKey}_cross_target_document_invalid`,
      );
    }
    for (const [factKey, value] of Object.entries(plan.observedValues)) {
      assert(
        typeof value === "string" && value.length > 0,
        `${phase}_${factKey}_expected_value_invalid`,
      );
    }
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(TARGET_SCOPE_PLAN).map(([phase, plan]) => [
        phase,
        Object.freeze({
          documentLabel: plan.documentLabel,
          factKeys: Object.freeze(targetScopeFactKeys(plan)),
        }),
      ]),
    ),
  );
}

function assertTargetScopedCandidate(phase, candidate, items, targetRef) {
  const plan = TARGET_SCOPE_PLAN[phase];
  assert(plan, `${phase}_target_scope_plan_missing`);
  const targetItems = items.filter((item) =>
    item.replacementTarget?.replacementTargetRef === targetRef
  );
  const actualFactKeys = [...new Set(targetItems.map((item) => item.factKey))]
    .sort();
  const expectedFactKeys = targetScopeFactKeys(plan);
  assert(
    targetItems.length === expectedFactKeys.length &&
      actualFactKeys.length === expectedFactKeys.length &&
      actualFactKeys.every((factKey, index) =>
        factKey === expectedFactKeys[index]
      ) &&
      targetItems.every((item) => item.documentLabel === plan.documentLabel),
    `${phase}_target_scope_expected_${expectedFactKeys.join("_")}_actual_${
      actualFactKeys.join("_")
    }`,
  );
  const facts = candidate.parserObservation?.observedFacts;
  assert(Array.isArray(facts), `${phase}_parser_observation_missing`);
  for (const [factKey, expectedValue] of Object.entries(plan.observedValues)) {
    const matches = facts.filter((fact) =>
      fact.factKey === factKey && fact.status === "observed"
    );
    assert(
      matches.length === 1,
      `${phase}_${factKey}_observed_count_expected_1_actual_${matches.length}`,
    );
    assert(
      matches[0].normalizedObservedValue === expectedValue,
      `${phase}_${factKey}_normalized_value_expected_${expectedValue}_actual_${
        matches[0].normalizedObservedValue
      }`,
    );
  }
  for (const factKey of plan.missingFactKeys) {
    const matches = facts.filter((fact) => fact.factKey === factKey);
    assert(
      matches.length === 1 && matches[0].status === "not_observed" &&
        matches[0].normalizedObservedValue === null,
      `${phase}_${factKey}_expected_not_observed`,
    );
  }
}

function assertServerNormalizedValues(runtime, phase, values) {
  const input = sqlLiteral(JSON.stringify(values));
  const actual = JSON.parse(psql(
    runtime,
    `begin read only;
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'factKey', item.value->>'factKey',
       'expected', item.value->>'expected',
       'actual', public.app_customer_correction_normalize_value_v1(
         item.value->>'factKey', item.value->>'value'
       )
     ) order by item.ordinality), '[]'::jsonb)::text
     from pg_catalog.jsonb_array_elements(${input}::jsonb)
       with ordinality item(value, ordinality);
     rollback;`,
  ));
  for (const item of actual) {
    assert(
      item.actual === item.expected,
      `${phase}_${item.factKey}_server_normalized_expected_${item.expected}_actual_${item.actual}`,
    );
  }
}

function assertSubmissionContract(
  phase,
  items,
  responses,
  factResolutions,
) {
  assert(
    responses.length === items.length,
    `${phase}_response_count_expected_${items.length}_actual_${responses.length}`,
  );
  const itemRefs = new Set(items.map((item) => item.itemRef));
  const responseRefs = new Set(responses.map((response) => response.itemRef));
  assert(
    responseRefs.size === items.length &&
      [...itemRefs].every((itemRef) => responseRefs.has(itemRef)),
    `${phase}_response_item_refs_invalid`,
  );
  const correctedRefs = new Set(
    responses.filter((response) => "correctedValue" in response).map((
      response,
    ) => response.itemRef),
  );
  const resolvedRefs = new Set(
    factResolutions.flatMap((resolution) => resolution.itemRefs),
  );
  assert(
    correctedRefs.size === resolvedRefs.size &&
      [...correctedRefs].every((itemRef) => resolvedRefs.has(itemRef)),
    `${phase}_resolution_item_refs_invalid`,
  );
  for (const resolution of factResolutions) {
    assert(
      resolution.itemRefs.length === 1,
      `${phase}_resolution_item_count_expected_1_actual_${resolution.itemRefs.length}`,
    );
    const response = responses.find((candidate) =>
      candidate.itemRef === resolution.itemRefs[0]
    );
    assert(response, `${phase}_resolution_response_missing`);
    if (resolution.resolutionType === "SOURCE_CONFIRMED") {
      assert(
        resolution.sources.length === 1 &&
          resolution.sources[0].candidateRef ===
            response.replacementCandidateRef &&
          resolution.sources[0].relationship === "direct" &&
          resolution.sources[0].selected === false &&
          !("transcriptionCandidateRef" in resolution),
        `${phase}_source_confirmed_route_invalid`,
      );
    } else {
      assert(
        resolution.resolutionType === "DOCUMENT_TRANSCRIPTION" &&
          resolution.sources.length === 0 &&
          resolution.transcriptionCandidateRef ===
            response.replacementCandidateRef,
        `${phase}_document_transcription_route_invalid`,
      );
    }
  }
}

async function challenge(runtime, context, suffix, responses, factResolutions) {
  assertSubmissionContract(
    suffix,
    context.current.handoff.items,
    responses,
    factResolutions,
  );
  const result = await requestCorrectionChallenge(
    runtime,
    context.f,
    context.auth.token,
    `${context.f.prefix}-${suffix}`,
    responses,
    "Proof Person",
    factResolutions,
  );
  assert(
    result.status === 201 && result.body?.challenge_reference,
    `${suffix}_challenge_failed_${result.status}_${
      result.body?.code ?? "none"
    }`,
  );
  return result;
}

function phaseState(runtime, context) {
  return JSON.parse(psql(
    runtime,
    `begin read only;
     with manifest as (
       select public.app_evidence_fact_review_manifest_v1(
         '${context.f.caseId}'
       ) value
     ) select pg_catalog.jsonb_build_object(
       'challengeBindingCount', (select count(*)
         from public.app_customer_correction_signer_challenge_bindings
         where case_id='${context.f.caseId}'),
       'challengeResponseCount', (select coalesce(sum(
         pg_catalog.jsonb_array_length(challenge.correction_payload->'responses')
       ), 0) from public.app_signup_signing_challenges challenge
         join public.app_customer_correction_signer_challenge_bindings binding
           on binding.challenge_id=challenge.id
         where binding.case_id='${context.f.caseId}'),
       'resolutionBindingCount', (select count(*)
         from public.app_customer_correction_fact_resolution_challenge_bindings binding
         join public.app_evidence_review_correction_handoffs handoff
           on handoff.id=binding.correction_handoff_id
         where handoff.case_id='${context.f.caseId}'),
       'submittedResolutionCount', (select coalesce(sum(
         pg_catalog.jsonb_array_length(binding.submitted_fact_resolutions)
       ), 0)
         from public.app_customer_correction_fact_resolution_challenge_bindings binding
         join public.app_evidence_review_correction_handoffs handoff
           on handoff.id=binding.correction_handoff_id
         where handoff.case_id='${context.f.caseId}'),
       'documentCount', (select count(*) from public.app_evidence_files
         where case_id='${context.f.caseId}'),
       'totalEvidenceVersionCount', (select count(*)
         from public.app_evidence_versions version
         join public.app_evidence_files file on file.id=version.evidence_file_id
         where file.case_id='${context.f.caseId}'),
       'candidateCount', (select count(*)
         from public.app_customer_correction_replacement_candidates
         where case_id='${context.f.caseId}'),
       'candidateTargetCount', (select count(distinct replacement_target_ref)
         from public.app_customer_correction_replacement_candidates
         where case_id='${context.f.caseId}'),
       'observationCount', (select count(*)
         from public.app_parser_observation_envelopes observation
         join public.app_customer_correction_replacement_candidates candidate
           on candidate.id=observation.correction_replacement_candidate_id
         where candidate.case_id='${context.f.caseId}'),
       'submissionCount', (select count(*)
         from public.app_evidence_review_customer_submissions
         where case_id='${context.f.caseId}'),
       'submissionItemCount', (select count(*)
         from public.app_evidence_review_customer_submission_items item
         join public.app_evidence_review_customer_submissions submission
           on submission.id=item.submission_id
         where submission.case_id='${context.f.caseId}'),
       'submittedValueItemCount', (select count(*)
         from public.app_evidence_review_customer_submission_items item
         join public.app_evidence_review_customer_submissions submission
           on submission.id=item.submission_id
         where submission.case_id='${context.f.caseId}'
           and item.submitted_value is not null),
       'documentOnlyItemCount', (select count(*)
         from public.app_evidence_review_customer_submission_items item
         join public.app_evidence_review_customer_submissions submission
           on submission.id=item.submission_id
         where submission.case_id='${context.f.caseId}'
           and item.action_requirement='DOCUMENT_REPLACEMENT'
           and item.submitted_value is null
           and item.resulting_canonical_value=item.prior_canonical_value),
       'submissionReplacementCount', (select count(*)
         from public.app_evidence_review_customer_submission_replacements replacement
         join public.app_evidence_review_customer_submissions submission
           on submission.id=replacement.submission_id
         where submission.case_id='${context.f.caseId}'),
       'committedReplacementTargetCount', (select count(distinct
           replacement.replacement_target_ref)
         from public.app_evidence_review_customer_submission_replacements replacement
         join public.app_evidence_review_customer_submissions submission
           on submission.id=replacement.submission_id
         where submission.case_id='${context.f.caseId}'),
       'promotedReplacementVersionCount', (select count(*)
         from public.app_evidence_versions version
         join public.app_evidence_files file on file.id=version.evidence_file_id
         where file.case_id='${context.f.caseId}'
           and version.correction_replacement_candidate_id is not null),
       'signingSnapshotCount', (select count(*)
         from public.app_signup_signing_snapshots snapshot
         where snapshot.subject_type='CUSTOMER_CORRECTION'
           and snapshot.subject_ref in (select submission.id
             from public.app_evidence_review_customer_submissions submission
             where submission.case_id='${context.f.caseId}')),
       'signerEvidenceBindingCount', (select count(*)
         from public.app_customer_correction_signer_evidence_bindings binding
         where binding.case_id='${context.f.caseId}'
           and binding.prepared_payload_sha256 is not null),
       'carryForwardCount', (select count(*)
         from public.app_evidence_review_decision_carry_forwards carry
         join public.app_evidence_review_customer_submissions submission
           on submission.id=carry.submission_id
         where submission.case_id='${context.f.caseId}'),
       'factResolutionCount', (select count(*)
         from public.app_evidence_review_customer_submission_fact_resolutions resolution
         join public.app_evidence_review_customer_submissions submission
           on submission.id=resolution.submission_id
         where submission.case_id='${context.f.caseId}'),
       'sourceConfirmedResolutionCount', (select count(*)
         from public.app_evidence_review_customer_submission_fact_resolutions resolution
         join public.app_evidence_review_customer_submissions submission
           on submission.id=resolution.submission_id
         where submission.case_id='${context.f.caseId}'
           and resolution.customer_resolution_type='SOURCE_CONFIRMED'),
       'transcriptionResolutionCount', (select count(*)
         from public.app_evidence_review_customer_submission_fact_resolutions resolution
         join public.app_evidence_review_customer_submissions submission
           on submission.id=resolution.submission_id
         where submission.case_id='${context.f.caseId}'
           and resolution.customer_resolution_type='DOCUMENT_TRANSCRIPTION'),
       'factResolutionSourceCount', (select count(*)
         from public.app_evidence_review_customer_submission_fact_resolution_sources source
         join public.app_evidence_review_customer_submission_fact_resolutions resolution
           on resolution.id=source.fact_resolution_id
         join public.app_evidence_review_customer_submissions submission
           on submission.id=resolution.submission_id
         where submission.case_id='${context.f.caseId}'),
       'manualDeclarationItemCount', (select count(*)
         from public.app_evidence_review_customer_submission_items item
         join public.app_evidence_review_customer_submissions submission
           on submission.id=item.submission_id
         where submission.case_id='${context.f.caseId}'
           and item.submitted_value='Manual Customer Declaration'),
       'partyNameNotObservedCount', (select count(*)
         from public.app_parser_observation_envelopes observation
         join public.app_customer_correction_replacement_candidates candidate
           on candidate.id=observation.correction_replacement_candidate_id
         where candidate.case_id='${context.f.caseId}'
           and exists (select 1
             from pg_catalog.jsonb_array_elements(
               observation.envelope->'observedFacts'
             ) fact(value)
             where fact.value->>'factKey'='partyName'
               and fact.value->>'status'='not_observed'
               and fact.value->'normalizedObservedValue'='null'::jsonb)),
       'overallStatus', public.app_evidence_review_overall_status_v1(
         '${context.f.caseId}', manifest.value->>'manifest_version',
         manifest.value->>'manifest_hash'
       )
     )::text from manifest;
     rollback;`,
  ));
}

function assertPhaseState(runtime, context, phase, expected) {
  const actual = phaseState(runtime, context);
  assertNamedState(phase, actual, expected);
  return actual;
}

function targetPhaseIdempotencyState(
  runtime,
  context,
  staged,
  challengeKey,
  finalizeKey,
) {
  const owner = staged.proofOwner;
  assert(owner, "target_phase_proof_owner_missing");
  const challengeKeySql = challengeKey === null
    ? "null"
    : sqlLiteral(challengeKey);
  const finalizeKeySql = finalizeKey === null
    ? "null"
    : sqlLiteral(finalizeKey);
  return JSON.parse(psql(
    runtime,
    `begin read only;
     with upload as (
       select current.*
       from public.app_customer_correction_replacement_uploads current
       where current.case_id=${sqlLiteral(context.f.caseId)}::uuid
         and current.upload_reference=${sqlLiteral(owner.uploadRef)}
         and current.replacement_target_ref=
           ${sqlLiteral(owner.replacementTargetRef)}
     ), candidate as (
       select current.*
       from public.app_customer_correction_replacement_candidates current
       join upload on upload.id=current.upload_id
     ), challenge as (
       select current.*
       from public.app_signup_signing_challenges current
       join public.app_evidence_review_correction_handoffs handoff
         on handoff.id=current.correction_handoff_id
       where handoff.case_id=${sqlLiteral(context.f.caseId)}::uuid
         and current.subject_type='CUSTOMER_CORRECTION'
         and current.correction_idempotency_key=${challengeKeySql}
     ), submission as (
       select current.*
       from public.app_evidence_review_customer_submissions current
       join public.app_customer_correction_signer_evidence_bindings binding
         on binding.submission_id=current.id
       join challenge on challenge.id=binding.challenge_id
       where current.case_id=${sqlLiteral(context.f.caseId)}::uuid
         and current.idempotency_key=${finalizeKeySql}
     )
     select pg_catalog.jsonb_build_object(
       'uploadCount', (select count(*) from upload),
       'uploadIssueOwnerCount', (select count(*) from upload
         where idempotency_key=${sqlLiteral(owner.issueKey)}),
       'candidateCount', (select count(*) from candidate),
       'candidateConfirmOwnerCount', (select count(*) from candidate
         where idempotency_key=${sqlLiteral(owner.confirmKey)}),
       'parserObservationCount', (select count(*)
         from public.app_parser_observation_envelopes observation
         join candidate on candidate.id=
           observation.correction_replacement_candidate_id),
       'issueAppIdempotencyCount', (select count(*)
         from public.app_idempotency_keys idempotency
         join upload on idempotency.scope=
           'customer_correction_replacement_issue:v1:case:' ||
           upload.case_id::text || ':handoff:' || upload.handoff_id::text ||
           ':target:' || upload.replacement_target_ref
         where idempotency.key=${sqlLiteral(owner.issueKey)}
           and idempotency.response_status=201
           and idempotency.response_body->>'upload_ref'=
             upload.upload_reference
           and idempotency.completed_at is not null),
       'confirmAppIdempotencyCount', (select count(*)
         from public.app_idempotency_keys idempotency
         join upload on idempotency.scope=
           'customer_correction_replacement_confirm:v1:upload:' ||
           upload.id::text
         join candidate on candidate.upload_id=upload.id
         where idempotency.key=${sqlLiteral(owner.confirmKey)}
           and idempotency.response_status=201
           and idempotency.response_body->>'candidate_ref'=
             candidate.candidate_reference
           and idempotency.completed_at is not null),
       'challengeCount', (select count(*) from challenge),
       'challengeAppIdempotencyCount', (select count(*)
         from public.app_idempotency_keys
         where key=${challengeKeySql}),
       'deliveredChallengeCount', (select count(*) from challenge
         where delivery_status='delivered'),
       'replacedChallengeCount', (select count(*) from challenge
         where replaced_at is not null),
       'consumedChallengeCount', (select count(*) from challenge
         where consumed_at is not null),
       'signerChallengeBindingCount', (select count(*)
         from public.app_customer_correction_signer_challenge_bindings binding
         join challenge on challenge.id=binding.challenge_id),
       'resolutionChallengeBindingCount', (select count(*)
         from public.app_customer_correction_fact_resolution_challenge_bindings binding
         join challenge on challenge.id=binding.challenge_id),
       'challengeDeliveryFingerprint', coalesce((select
         pg_catalog.encode(extensions.digest(pg_catalog.concat_ws('|',
           challenge.delivery_status,
           challenge.delivered_at::text,
           challenge.transport_id,
           challenge.provider_delivery_reference
         ), 'sha256'), 'hex') from challenge), ''),
       'submissionCount', (select count(*) from submission),
       'submissionAppIdempotencyCount', (select count(*)
         from public.app_idempotency_keys
         where key=${finalizeKeySql}),
       'signerEvidenceBindingCount', (select count(*)
         from public.app_customer_correction_signer_evidence_bindings binding
         join submission on submission.id=binding.submission_id),
       'submissionItemCount', (select count(*)
         from public.app_evidence_review_customer_submission_items item
         join submission on submission.id=item.submission_id),
       'submissionReplacementCount', (select count(*)
         from public.app_evidence_review_customer_submission_replacements replacement
         join submission on submission.id=replacement.submission_id),
       'factResolutionCount', (select count(*)
         from public.app_evidence_review_customer_submission_fact_resolutions resolution
         join submission on submission.id=resolution.submission_id)
     )::text;
     rollback;`,
  ));
}

function assertTargetPhaseIdempotency(
  runtime,
  context,
  phase,
  staged,
  challengeKey,
  finalizeKey,
  expected,
) {
  const actual = targetPhaseIdempotencyState(
    runtime,
    context,
    staged,
    challengeKey,
    finalizeKey,
  );
  assertNamedState(`${phase}_row_owned_idempotency`, actual, {
    uploadCount: 1,
    uploadIssueOwnerCount: 1,
    candidateCount: 1,
    candidateConfirmOwnerCount: 1,
    parserObservationCount: 1,
    issueAppIdempotencyCount: 1,
    confirmAppIdempotencyCount: 1,
    challengeAppIdempotencyCount: 0,
    submissionAppIdempotencyCount: 0,
    ...expected,
  });
  return actual;
}

function uploadCandidateStagedLedger(
  runtime,
  context,
  staged,
  energyTargetRef,
  invoiceTargetRef,
) {
  const owner = staged.proofOwner;
  assert(owner, "upload_candidate_ledger_owner_missing");
  return JSON.parse(psql(
    runtime,
    `begin read only;
     with upload as (
       select current.*
       from public.app_customer_correction_replacement_uploads current
       where current.case_id=${sqlLiteral(context.f.caseId)}::uuid
         and current.upload_reference=${sqlLiteral(owner.uploadRef)}
     ), candidate as (
       select current.*
       from public.app_customer_correction_replacement_candidates current
       join upload on upload.id=current.upload_id
     )
     select pg_catalog.jsonb_build_object(
       'energyDocumentLineageCount', (select count(*)
         from public.app_evidence_files file
         join public.app_evidence_versions version
           on version.evidence_file_id=file.id
         where file.id=${sqlLiteral(context.f.energyFileId)}::uuid
           and version.id=${sqlLiteral(context.f.energyVersionId)}::uuid
           and file.case_id=${sqlLiteral(context.f.caseId)}::uuid
           and file.document_type='energy_bill_or_contract'
           and version.storage_bucket='proof-private'
           and version.storage_path=${
      sqlLiteral(`${context.f.prefix}-energy.pdf`)
    }
           and version.sha256=${sqlLiteral(HASH)}),
       'invoiceDocumentLineageCount', (select count(*)
         from public.app_evidence_files file
         join public.app_evidence_versions version
           on version.evidence_file_id=file.id
         where file.id=${sqlLiteral(context.f.invoiceFileId)}::uuid
           and version.id=${sqlLiteral(context.f.invoiceVersionId)}::uuid
           and file.case_id=${sqlLiteral(context.f.caseId)}::uuid
           and file.document_type='installation_invoice'
           and version.storage_bucket='proof-private'
           and version.storage_path=${
      sqlLiteral(`${context.f.prefix}-invoice.pdf`)
    }
           and version.sha256=${sqlLiteral(HASH)}),
       'energyCandidateLineageCount', (select count(*) from candidate
         join upload on upload.id=candidate.upload_id
         join public.app_parser_observation_envelopes observation
           on observation.correction_replacement_candidate_id=candidate.id
         where upload.predecessor_evidence_file_id=
             ${sqlLiteral(context.f.energyFileId)}::uuid
           and upload.predecessor_evidence_version_id=
             ${sqlLiteral(context.f.energyVersionId)}::uuid
           and upload.replacement_target_ref=${sqlLiteral(energyTargetRef)}
           and upload.parser_profile='energy_document_v1'
           and upload.storage_bucket='app-documents'
           and candidate.predecessor_evidence_file_id=upload.predecessor_evidence_file_id
           and candidate.predecessor_evidence_version_id=upload.predecessor_evidence_version_id
           and candidate.replacement_target_ref=upload.replacement_target_ref
           and candidate.storage_bucket=upload.storage_bucket
           and candidate.storage_path=upload.storage_path
           and candidate.server_sha256=${sqlLiteral(owner.byteSha256)}
           and observation.byte_sha256=candidate.server_sha256),
       'invoiceCandidateLineageCount', (select count(*) from candidate
         where candidate.predecessor_evidence_file_id=
             ${sqlLiteral(context.f.invoiceFileId)}::uuid
            or candidate.replacement_target_ref=${
      sqlLiteral(invoiceTargetRef)
    }),
       'promotedCandidateEvidenceVersionCount', (select count(*)
         from public.app_evidence_versions version
         where version.correction_replacement_candidate_id in (
           select candidate.id from candidate
         )),
       'storageObjectLineageCount', (select count(*) from storage.objects object
         join candidate on candidate.storage_bucket=object.bucket_id
           and candidate.storage_path=object.name),
       'uploadIssuedAuditCount', (select count(*)
         from public.app_audit_events audit
         where audit.scope_id=${sqlLiteral(context.f.caseId)}::uuid
           and audit.event_type='customer_correction_replacement_upload_issued'
           and audit.request_id=${sqlLiteral(`${owner.issueKey}-request`)}
           and audit.idempotency_key=${sqlLiteral(owner.issueKey)}),
       'candidateConfirmedAuditCount', (select count(*)
         from public.app_audit_events audit
         where audit.scope_id=${sqlLiteral(context.f.caseId)}::uuid
           and audit.event_type='customer_correction_replacement_candidate_confirmed'
           and audit.request_id=${sqlLiteral(`${owner.confirmKey}-request`)}
           and audit.idempotency_key=${sqlLiteral(owner.confirmKey)}),
       'completedStageIdempotencyCount', (select count(*)
         from public.app_idempotency_keys idempotency
         where idempotency.key in (
           ${sqlLiteral(owner.issueKey)}, ${sqlLiteral(owner.confirmKey)}
         ) and idempotency.completed_at is not null)
     )::text;
     rollback;`,
  ));
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
    { proveInvalidRequiredMissing: true },
  );
  try {
    const items = context.current.handoff.items;
    assert(
      items.length === 4 && context.requiredMissingFactKeys.has("midNumber"),
      "combined_required_missing_items_invalid",
    );
    const energyTarget = items.find((item) =>
      item.documentLabel === "Energiedocument"
    ).replacementTarget.replacementTargetRef;
    const invoiceTarget = items.find((item) =>
      item.documentLabel === "Installatiefactuur"
    ).replacementTarget.replacementTargetRef;
    const invoice = await stage(
      runtime,
      context,
      "combined_invoice",
      invoiceTarget,
      "invoice-current",
      CURRENT_INSTALLATION_DOCUMENT_LINES,
    );
    assertTargetScopedCandidate(
      "combined_invoice",
      invoice,
      items,
      invoiceTarget,
    );
    const oldEnergy = await stage(
      runtime,
      context,
      "combined_stale_energy",
      energyTarget,
      "energy-old",
      [
        "Energieleverancier:Proof Supplier",
        "Contracthouder:Old Proof Person",
        "Leveradres:Old Proofstraat 1",
        "Postcode:1234AB Proefstad",
        "Elektriciteit 871685900012345679",
      ],
    );
    assertTargetScopedCandidate(
      "combined_stale_energy",
      oldEnergy,
      items,
      energyTarget,
    );
    assertPhaseState(runtime, context, "combined_stale_documents_staged", {
      documentCount: 2,
      totalEvidenceVersionCount: 2,
      candidateCount: 2,
      candidateTargetCount: 2,
      observationCount: 2,
      challengeBindingCount: 0,
      resolutionBindingCount: 0,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    const staleResponses = responsesFor(
      items,
      new Map([
        [energyTarget, oldEnergy.candidateRef],
        [invoiceTarget, invoice.candidateRef],
      ]),
      STALE_ENERGY_VALUE_MAP,
    );
    const staleCandidates = new Map([
      [energyTarget, oldEnergy.candidateRef],
      [invoiceTarget, invoice.candidateRef],
    ]);
    const staleResolutions = factResolutionsFor(items, staleCandidates);
    const staleChallengeKey = `${context.f.prefix}-challenge-stale`;
    const staleChallenge = await challenge(
      runtime,
      context,
      "challenge-stale",
      staleResponses,
      staleResolutions,
    );
    assertPhaseState(runtime, context, "combined_stale_challenge_issued", {
      challengeBindingCount: 1,
      challengeResponseCount: 4,
      resolutionBindingCount: 1,
      submittedResolutionCount: 4,
      submissionCount: 0,
      submissionItemCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    const staleOwnerBeforeReplay = assertTargetPhaseIdempotency(
      runtime,
      context,
      "combined_stale_energy_challenge_issued",
      oldEnergy,
      staleChallengeKey,
      null,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
    const staleChallengeReplay = await requestCorrectionChallenge(
      runtime,
      context.f,
      context.auth.token,
      staleChallengeKey,
      staleResponses,
      "Proof Person",
      staleResolutions,
    );
    assert(
      staleChallengeReplay.status === 200 &&
        staleChallengeReplay.body?.challenge_reference ===
          staleChallenge.body.challenge_reference,
      "combined_stale_challenge_exact_replay_failed",
    );
    const staleOwnerAfterReplay = assertTargetPhaseIdempotency(
      runtime,
      context,
      "combined_stale_energy_challenge_replayed",
      oldEnergy,
      staleChallengeKey,
      null,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
    assert(
      JSON.stringify(staleOwnerAfterReplay) ===
          JSON.stringify(staleOwnerBeforeReplay) &&
        staleOwnerAfterReplay.challengeDeliveryFingerprint !== "",
      "combined_stale_challenge_replay_mutated_delivery_or_binding",
    );
    const staleOtp = await correctionOtp(
      runtime,
      context.f,
      staleChallenge.body.challenge_reference,
    );
    const energy = await stage(
      runtime,
      context,
      "combined_current_energy",
      energyTarget,
      "energy-current",
      [
        "Energieleverancier:Proof Supplier",
        "Contracthouder:Proof Person Corrected",
        "Leveradres:New Proofstraat 34",
        "Postcode:1234AB Proefstad",
        "Elektriciteit 871685900012345678",
      ],
    );
    assertTargetScopedCandidate(
      "combined_current_energy",
      energy,
      items,
      energyTarget,
    );
    const responses = responsesFor(
      items,
      new Map([
        [energyTarget, energy.candidateRef],
        [invoiceTarget, invoice.candidateRef],
      ]),
    );
    const currentCandidates = new Map([
      [energyTarget, energy.candidateRef],
      [invoiceTarget, invoice.candidateRef],
    ]);
    const currentResolutions = factResolutionsFor(items, currentCandidates);
    assertSubmissionContract(
      "combined_changed_candidate_conflict",
      items,
      responses,
      currentResolutions,
    );
    const changedCandidateConflict = await requestCorrectionChallenge(
      runtime,
      context.f,
      context.auth.token,
      `${context.f.prefix}-challenge-stale`,
      responses,
      "Proof Person",
      currentResolutions,
    );
    assert(
      changedCandidateConflict.status === 409 &&
        changedCandidateConflict.body?.code === "idempotency_conflict",
      "changed_candidate_same_context_not_denied",
    );
    assertPhaseState(runtime, context, "combined_changed_candidate_conflict", {
      candidateCount: 3,
      candidateTargetCount: 2,
      observationCount: 3,
      challengeBindingCount: 1,
      challengeResponseCount: 4,
      resolutionBindingCount: 1,
      submittedResolutionCount: 4,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "combined_stale_energy_changed_payload_conflict",
      oldEnergy,
      staleChallengeKey,
      null,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
    const staleFinalizeKey = `${context.f.prefix}-stale-finalize`;
    const staleFinalize = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      staleFinalizeKey,
      {
        challengeReference: staleChallenge.body.challenge_reference,
        otp: staleOtp,
        typedFullName: "Proof Person",
      },
    );
    assert(staleFinalize.status === 409, "stale_candidate_finalize_not_denied");
    assertPhaseState(runtime, context, "combined_stale_finalize_denied", {
      challengeBindingCount: 1,
      resolutionBindingCount: 1,
      candidateCount: 3,
      observationCount: 3,
      submissionCount: 0,
      submissionItemCount: 0,
      submissionReplacementCount: 0,
      promotedReplacementVersionCount: 0,
      signingSnapshotCount: 0,
      signerEvidenceBindingCount: 0,
      factResolutionCount: 0,
      factResolutionSourceCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "combined_stale_energy_finalize_denied",
      oldEnergy,
      staleChallengeKey,
      staleFinalizeKey,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
    const currentChallengeKey = `${context.f.prefix}-challenge-current`;
    const signedChallenge = await challenge(
      runtime,
      context,
      "challenge-current",
      responses,
      currentResolutions,
    );
    assertPhaseState(runtime, context, "combined_current_challenge_issued", {
      challengeBindingCount: 2,
      challengeResponseCount: 8,
      resolutionBindingCount: 2,
      submittedResolutionCount: 8,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "combined_current_energy_challenge_issued",
      energy,
      currentChallengeKey,
      null,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
    const challengeReference = signedChallenge.body.challenge_reference;
    const otp = await correctionOtp(runtime, context.f, challengeReference);
    addSignerAuthorityDrift(runtime, context.f);
    const authorityDriftKey = `${context.f.prefix}-authority-drift`;
    const authorityDenied = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      authorityDriftKey,
      { challengeReference, otp, typedFullName: "Proof Person Changed" },
    );
    assert(
      authorityDenied.status === 409 &&
        authorityDenied.body?.code === "signer_authority_changed",
      "authority_drift_not_denied",
    );
    assertPhaseState(runtime, context, "combined_authority_drift_denied", {
      challengeBindingCount: 2,
      resolutionBindingCount: 2,
      submissionCount: 0,
      submissionItemCount: 0,
      submissionReplacementCount: 0,
      promotedReplacementVersionCount: 0,
      signingSnapshotCount: 0,
      signerEvidenceBindingCount: 0,
      factResolutionCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "combined_current_energy_authority_drift_denied",
      energy,
      currentChallengeKey,
      authorityDriftKey,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
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
    assertPhaseState(runtime, context, "combined_current_finalize_success", {
      challengeBindingCount: 2,
      challengeResponseCount: 8,
      resolutionBindingCount: 2,
      submittedResolutionCount: 8,
      documentCount: 2,
      totalEvidenceVersionCount: 4,
      candidateCount: 3,
      candidateTargetCount: 2,
      observationCount: 3,
      submissionCount: 1,
      submissionItemCount: 4,
      submittedValueItemCount: 4,
      documentOnlyItemCount: 0,
      submissionReplacementCount: 2,
      committedReplacementTargetCount: 2,
      promotedReplacementVersionCount: 2,
      signingSnapshotCount: 1,
      signerEvidenceBindingCount: 1,
      carryForwardCount: 0,
      factResolutionCount: 4,
      sourceConfirmedResolutionCount: 4,
      transcriptionResolutionCount: 0,
      factResolutionSourceCount: 4,
      overallStatus: "TO_REVIEW",
    });
    const combinedFinalizeOwner = {
      challengeCount: 1,
      deliveredChallengeCount: 1,
      replacedChallengeCount: 0,
      consumedChallengeCount: 1,
      signerChallengeBindingCount: 1,
      resolutionChallengeBindingCount: 1,
      submissionCount: 1,
      signerEvidenceBindingCount: 1,
      submissionItemCount: 4,
      submissionReplacementCount: 2,
      factResolutionCount: 4,
    };
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "combined_invoice_finalize_success",
      invoice,
      currentChallengeKey,
      finalizeKey,
      combinedFinalizeOwner,
    );
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "combined_current_energy_finalize_success",
      energy,
      currentChallengeKey,
      finalizeKey,
      combinedFinalizeOwner,
    );
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "combined_stale_energy_replaced_without_submission",
      oldEnergy,
      staleChallengeKey,
      null,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 1,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
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
  const context = await buildHandoff(
    runtime,
    prefix,
    (subject) =>
      subject.evidenceKind === "energy_bill_or_contract" &&
      subject.factKey === "partyName" && subject.valueStatus === "PRESENT",
    () => "DOCUMENT_REPLACEMENT",
  );
  try {
    const items = context.current.handoff.items;
    assert(
      items.length === 2 && context.requiredMissingFactKeys.has("midNumber"),
      "document_required_missing_items_invalid",
    );
    const energyTarget = items.find((item) =>
      item.documentLabel === "Energiedocument"
    ).replacementTarget.replacementTargetRef;
    const invoiceTarget = items.find((item) =>
      item.documentLabel === "Installatiefactuur"
    ).replacementTarget.replacementTargetRef;
    const energy = await stage(
      runtime,
      context,
      "document_only_energy",
      energyTarget,
      "document-energy",
      CURRENT_ENERGY_DOCUMENT_LINES,
    );
    assertTargetScopedCandidate(
      "document_only_energy",
      energy,
      items,
      energyTarget,
    );
    const invoice = await stage(
      runtime,
      context,
      "document_only_invoice",
      invoiceTarget,
      "document-invoice",
      CURRENT_INSTALLATION_DOCUMENT_LINES,
    );
    assertTargetScopedCandidate(
      "document_only_invoice",
      invoice,
      items,
      invoiceTarget,
    );
    assertPhaseState(runtime, context, "document_only_documents_staged", {
      documentCount: 2,
      totalEvidenceVersionCount: 2,
      candidateCount: 2,
      candidateTargetCount: 2,
      observationCount: 2,
      challengeBindingCount: 0,
      resolutionBindingCount: 0,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    const responses = responsesFor(
      items,
      new Map([
        [energyTarget, energy.candidateRef],
        [invoiceTarget, invoice.candidateRef],
      ]),
    );
    const candidateRefs = new Map([
      [energyTarget, energy.candidateRef],
      [invoiceTarget, invoice.candidateRef],
    ]);
    const documentChallengeKey = `${context.f.prefix}-document-challenge`;
    const issued = await challenge(
      runtime,
      context,
      "document-challenge",
      responses,
      factResolutionsFor(items, candidateRefs),
    );
    assertPhaseState(runtime, context, "document_only_challenge_issued", {
      challengeBindingCount: 1,
      challengeResponseCount: 2,
      resolutionBindingCount: 1,
      submittedResolutionCount: 1,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    const documentChallengeOwner = {
      challengeCount: 1,
      deliveredChallengeCount: 1,
      replacedChallengeCount: 0,
      consumedChallengeCount: 0,
      signerChallengeBindingCount: 1,
      resolutionChallengeBindingCount: 1,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      submissionItemCount: 0,
      submissionReplacementCount: 0,
      factResolutionCount: 0,
    };
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "document_only_energy_challenge_issued",
      energy,
      documentChallengeKey,
      null,
      documentChallengeOwner,
    );
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "document_only_invoice_challenge_issued",
      invoice,
      documentChallengeKey,
      null,
      documentChallengeOwner,
    );
    const otp = await correctionOtp(
      runtime,
      context.f,
      issued.body.challenge_reference,
    );
    const documentFinalizeKey = `${context.f.prefix}-finalize`;
    const finalized = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      documentFinalizeKey,
      {
        challengeReference: issued.body.challenge_reference,
        otp,
        typedFullName: "Proof Person",
      },
    );
    assert(finalized.status === 201, "document_only_finalize_failed");
    assertPhaseState(runtime, context, "document_only_finalize_success", {
      challengeBindingCount: 1,
      challengeResponseCount: 2,
      resolutionBindingCount: 1,
      submittedResolutionCount: 1,
      documentCount: 2,
      totalEvidenceVersionCount: 4,
      candidateCount: 2,
      candidateTargetCount: 2,
      observationCount: 2,
      submissionCount: 1,
      submissionItemCount: 2,
      submittedValueItemCount: 1,
      documentOnlyItemCount: 1,
      submissionReplacementCount: 2,
      committedReplacementTargetCount: 2,
      promotedReplacementVersionCount: 2,
      signingSnapshotCount: 1,
      signerEvidenceBindingCount: 1,
      carryForwardCount: 0,
      factResolutionCount: 1,
      sourceConfirmedResolutionCount: 1,
      transcriptionResolutionCount: 0,
      factResolutionSourceCount: 1,
      overallStatus: "TO_REVIEW",
    });
    const documentFinalizeOwner = {
      ...documentChallengeOwner,
      consumedChallengeCount: 1,
      submissionCount: 1,
      signerEvidenceBindingCount: 1,
      submissionItemCount: 2,
      submissionReplacementCount: 2,
      factResolutionCount: 1,
    };
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "document_only_energy_finalize_success",
      energy,
      documentChallengeKey,
      documentFinalizeKey,
      documentFinalizeOwner,
    );
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "document_only_invoice_finalize_success",
      invoice,
      documentChallengeKey,
      documentFinalizeKey,
      documentFinalizeOwner,
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
    const items = context.current.handoff.items;
    assert(
      items.length === 2 && context.requiredMissingFactKeys.has("midNumber"),
      "parser_miss_required_missing_items_invalid",
    );
    const energyTarget = items.find((item) =>
      item.documentLabel === "Energiedocument"
    ).replacementTarget.replacementTargetRef;
    const invoiceTarget = items.find((item) =>
      item.documentLabel === "Installatiefactuur"
    ).replacementTarget.replacementTargetRef;
    const candidate = await stage(
      runtime,
      context,
      "parser_miss_energy",
      energyTarget,
      "parser-miss",
      [],
    );
    assertTargetScopedCandidate(
      "parser_miss_energy",
      candidate,
      items,
      energyTarget,
    );
    const invoice = await stage(
      runtime,
      context,
      "parser_miss_invoice",
      invoiceTarget,
      "parser-miss-invoice",
      CURRENT_INSTALLATION_DOCUMENT_LINES,
    );
    assertTargetScopedCandidate(
      "parser_miss_invoice",
      invoice,
      items,
      invoiceTarget,
    );
    assertPhaseState(runtime, context, "parser_miss_documents_staged", {
      documentCount: 2,
      totalEvidenceVersionCount: 2,
      candidateCount: 2,
      candidateTargetCount: 2,
      observationCount: 2,
      challengeBindingCount: 0,
      resolutionBindingCount: 0,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      partyNameNotObservedCount: 1,
      overallStatus: "WAITING_CUSTOMER",
    });
    const responses = responsesFor(
      items,
      new Map([
        [energyTarget, candidate.candidateRef],
        [invoiceTarget, invoice.candidateRef],
      ]),
      { partyName: "Manual Customer Declaration" },
    );
    const candidateRefs = new Map([
      [energyTarget, candidate.candidateRef],
      [invoiceTarget, invoice.candidateRef],
    ]);
    const parserMissChallengeKey = `${context.f.prefix}-miss-challenge`;
    const issued = await challenge(
      runtime,
      context,
      "miss-challenge",
      responses,
      factResolutionsFor(items, candidateRefs, ["partyName"]),
    );
    assertPhaseState(runtime, context, "parser_miss_challenge_issued", {
      challengeBindingCount: 1,
      challengeResponseCount: 2,
      resolutionBindingCount: 1,
      submittedResolutionCount: 2,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    const parserMissChallengeOwner = {
      challengeCount: 1,
      deliveredChallengeCount: 1,
      replacedChallengeCount: 0,
      consumedChallengeCount: 0,
      signerChallengeBindingCount: 1,
      resolutionChallengeBindingCount: 1,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      submissionItemCount: 0,
      submissionReplacementCount: 0,
      factResolutionCount: 0,
    };
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "parser_miss_energy_challenge_issued",
      candidate,
      parserMissChallengeKey,
      null,
      parserMissChallengeOwner,
    );
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "parser_miss_invoice_challenge_issued",
      invoice,
      parserMissChallengeKey,
      null,
      parserMissChallengeOwner,
    );
    const otp = await correctionOtp(
      runtime,
      context.f,
      issued.body.challenge_reference,
    );
    const parserMissFinalizeKey = `${context.f.prefix}-finalize`;
    const finalized = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      parserMissFinalizeKey,
      {
        challengeReference: issued.body.challenge_reference,
        otp,
        typedFullName: "Proof Person",
      },
    );
    assert(finalized.status === 201, "parser_miss_manual_finalize_failed");
    assertPhaseState(runtime, context, "parser_miss_finalize_success", {
      challengeBindingCount: 1,
      challengeResponseCount: 2,
      resolutionBindingCount: 1,
      submittedResolutionCount: 2,
      documentCount: 2,
      totalEvidenceVersionCount: 4,
      candidateCount: 2,
      candidateTargetCount: 2,
      observationCount: 2,
      submissionCount: 1,
      submissionItemCount: 2,
      submittedValueItemCount: 2,
      documentOnlyItemCount: 0,
      submissionReplacementCount: 2,
      committedReplacementTargetCount: 2,
      promotedReplacementVersionCount: 2,
      signingSnapshotCount: 1,
      signerEvidenceBindingCount: 1,
      carryForwardCount: 0,
      factResolutionCount: 2,
      sourceConfirmedResolutionCount: 1,
      transcriptionResolutionCount: 1,
      factResolutionSourceCount: 1,
      manualDeclarationItemCount: 1,
      partyNameNotObservedCount: 1,
      overallStatus: "TO_REVIEW",
    });
    const parserMissFinalizeOwner = {
      ...parserMissChallengeOwner,
      consumedChallengeCount: 1,
      submissionCount: 1,
      signerEvidenceBindingCount: 1,
      submissionItemCount: 2,
      submissionReplacementCount: 2,
      factResolutionCount: 2,
    };
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "parser_miss_energy_finalize_success",
      candidate,
      parserMissChallengeKey,
      parserMissFinalizeKey,
      parserMissFinalizeOwner,
    );
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "parser_miss_invoice_finalize_success",
      invoice,
      parserMissChallengeKey,
      parserMissFinalizeKey,
      parserMissFinalizeOwner,
    );
  } finally {
    await dispose(runtime, context);
  }
}

async function runFailureAtomicity(runtime, prefix) {
  const context = await buildHandoff(
    runtime,
    prefix,
    (subject) =>
      subject.valueStatus === "PRESENT" &&
      (subject.evidenceKind === "energy_bill_or_contract" &&
          subject.factKey === "partyName" ||
        subject.evidenceKind === "installation_invoice" &&
          subject.factKey === "chargerBrand"),
    () => "DOCUMENT_REPLACEMENT",
  );
  try {
    const items = context.current.handoff.items;
    assert(
      items.length === 3 && context.requiredMissingFactKeys.has("midNumber"),
      "atomic_required_missing_items_invalid",
    );
    const targets = [
      ...new Set(
        items.map((item) => item.replacementTarget.replacementTargetRef),
      ),
    ];
    assert(targets.length === 2, "atomicity_cross_document_targets_missing");
    const candidates = new Map();
    const stagedByPhase = new Map();
    for (const [index, target] of targets.entries()) {
      const documentLabel = items.find((item) =>
        item.replacementTarget.replacementTargetRef === target
      ).documentLabel;
      const candidate = await stage(
        runtime,
        context,
        documentLabel === "Energiedocument"
          ? "atomic_energy"
          : "atomic_invoice",
        target,
        `atomic-${index}`,
        documentLabel === "Energiedocument"
          ? CURRENT_ENERGY_DOCUMENT_LINES
          : CURRENT_INSTALLATION_DOCUMENT_LINES,
      );
      if (documentLabel === "Energiedocument") {
        assertTargetScopedCandidate(
          "atomic_energy",
          candidate,
          items,
          target,
        );
      } else {
        assertTargetScopedCandidate(
          "atomic_invoice",
          candidate,
          items,
          target,
        );
      }
      candidates.set(target, candidate.candidateRef);
      stagedByPhase.set(
        documentLabel === "Energiedocument"
          ? "atomic_energy"
          : "atomic_invoice",
        candidate,
      );
    }
    assertPhaseState(runtime, context, "atomic_documents_staged", {
      documentCount: 2,
      totalEvidenceVersionCount: 2,
      candidateCount: 2,
      candidateTargetCount: 2,
      observationCount: 2,
      challengeBindingCount: 0,
      resolutionBindingCount: 0,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    const responses = responsesFor(
      items,
      candidates,
    );
    const atomicChallengeKey = `${context.f.prefix}-challenge`;
    const issued = await challenge(
      runtime,
      context,
      "challenge",
      responses,
      factResolutionsFor(items, candidates),
    );
    assertPhaseState(runtime, context, "atomic_challenge_issued", {
      challengeBindingCount: 1,
      challengeResponseCount: 3,
      resolutionBindingCount: 1,
      submittedResolutionCount: 1,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    const atomicChallengeOwner = {
      challengeCount: 1,
      deliveredChallengeCount: 1,
      replacedChallengeCount: 0,
      consumedChallengeCount: 0,
      signerChallengeBindingCount: 1,
      resolutionChallengeBindingCount: 1,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      submissionItemCount: 0,
      submissionReplacementCount: 0,
      factResolutionCount: 0,
    };
    for (const phase of ["atomic_energy", "atomic_invoice"]) {
      assertTargetPhaseIdempotency(
        runtime,
        context,
        `${phase}_challenge_issued`,
        stagedByPhase.get(phase),
        atomicChallengeKey,
        null,
        atomicChallengeOwner,
      );
    }
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
        result.ok === false && result.code === "internal_error",
        `failure_stage_not_denied_${suffix}`,
      );
      assertPhaseState(runtime, context, `atomic_failure_${suffix}`, {
        challengeBindingCount: 1,
        challengeResponseCount: 3,
        resolutionBindingCount: 1,
        submittedResolutionCount: 1,
        candidateCount: 2,
        candidateTargetCount: 2,
        observationCount: 2,
        submissionCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        promotedReplacementVersionCount: 0,
        signingSnapshotCount: 0,
        signerEvidenceBindingCount: 0,
        factResolutionCount: 0,
        factResolutionSourceCount: 0,
        overallStatus: "WAITING_CUSTOMER",
      });
      for (const phase of ["atomic_energy", "atomic_invoice"]) {
        assertTargetPhaseIdempotency(
          runtime,
          context,
          `${phase}_failure_${suffix}`,
          stagedByPhase.get(phase),
          atomicChallengeKey,
          `${context.f.prefix}-${suffix}`,
          atomicChallengeOwner,
        );
      }
    }
    const otp = await correctionOtp(
      runtime,
      context.f,
      issued.body.challenge_reference,
    );
    const atomicFinalizeKey = `${context.f.prefix}-atomic-success`;
    const finalized = await finalizeCorrection(
      runtime,
      context.f,
      context.auth.token,
      atomicFinalizeKey,
      {
        challengeReference: issued.body.challenge_reference,
        otp,
        typedFullName: "Proof Person",
      },
    );
    assert(finalized.status === 201, "cross_document_atomic_finalize_failed");
    assertPhaseState(runtime, context, "atomic_finalize_success", {
      challengeBindingCount: 1,
      challengeResponseCount: 3,
      resolutionBindingCount: 1,
      submittedResolutionCount: 1,
      documentCount: 2,
      totalEvidenceVersionCount: 4,
      candidateCount: 2,
      candidateTargetCount: 2,
      observationCount: 2,
      submissionCount: 1,
      submissionItemCount: 3,
      submittedValueItemCount: 1,
      documentOnlyItemCount: 2,
      submissionReplacementCount: 2,
      committedReplacementTargetCount: 2,
      promotedReplacementVersionCount: 2,
      signingSnapshotCount: 1,
      signerEvidenceBindingCount: 1,
      carryForwardCount: 0,
      factResolutionCount: 1,
      sourceConfirmedResolutionCount: 1,
      transcriptionResolutionCount: 0,
      factResolutionSourceCount: 1,
      overallStatus: "TO_REVIEW",
    });
    const atomicFinalizeOwner = {
      ...atomicChallengeOwner,
      consumedChallengeCount: 1,
      submissionCount: 1,
      signerEvidenceBindingCount: 1,
      submissionItemCount: 3,
      submissionReplacementCount: 2,
      factResolutionCount: 1,
    };
    for (const phase of ["atomic_energy", "atomic_invoice"]) {
      assertTargetPhaseIdempotency(
        runtime,
        context,
        `${phase}_finalize_success`,
        stagedByPhase.get(phase),
        atomicChallengeKey,
        atomicFinalizeKey,
        atomicFinalizeOwner,
      );
    }
  } finally {
    await dispose(runtime, context);
  }
}

async function runUploadCandidate(runtime, prefix) {
  const context = await buildHandoff(
    runtime,
    prefix,
    (subject) =>
      subject.valueStatus === "PRESENT" &&
      subject.evidenceKind === "energy_bill_or_contract" &&
      subject.factKey === "partyName",
    () => "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  );
  try {
    const items = context.current.handoff.items;
    const targetRef = items.find((item) =>
      item.documentLabel === "Energiedocument"
    ).replacementTarget.replacementTargetRef;
    const invoiceTargetRef = items.find((item) =>
      item.documentLabel === "Installatiefactuur"
    ).replacementTarget.replacementTargetRef;
    assertNamedState("upload_candidate_handoff_targets", {
      itemCount: items.length,
      uniqueTargetCount: new Set(
        items.map((item) => item.replacementTarget.replacementTargetRef),
      ).size,
    }, {
      itemCount: 2,
      uniqueTargetCount: 2,
    });
    const candidate = await stage(
      runtime,
      context,
      "upload_candidate_energy",
      targetRef,
      "upload-candidate",
      CURRENT_ENERGY_DOCUMENT_LINES,
    );
    assertTargetScopedCandidate(
      "upload_candidate_energy",
      candidate,
      items,
      targetRef,
    );
    assertPhaseState(runtime, context, "upload_candidate_staged", {
      documentCount: 2,
      totalEvidenceVersionCount: 2,
      candidateCount: 1,
      candidateTargetCount: 1,
      observationCount: 1,
      challengeBindingCount: 0,
      resolutionBindingCount: 0,
      submissionCount: 0,
      signerEvidenceBindingCount: 0,
      overallStatus: "WAITING_CUSTOMER",
    });
    assertNamedState(
      "upload_candidate_staged_lineage",
      uploadCandidateStagedLedger(
        runtime,
        context,
        candidate,
        targetRef,
        invoiceTargetRef,
      ),
      {
        energyDocumentLineageCount: 1,
        invoiceDocumentLineageCount: 1,
        energyCandidateLineageCount: 1,
        invoiceCandidateLineageCount: 0,
        promotedCandidateEvidenceVersionCount: 0,
        storageObjectLineageCount: 1,
        uploadIssuedAuditCount: 1,
        candidateConfirmedAuditCount: 1,
        completedStageIdempotencyCount: 2,
      },
    );
    assertTargetPhaseIdempotency(
      runtime,
      context,
      "upload_candidate_owner",
      candidate,
      null,
      null,
      {
        challengeCount: 0,
        deliveredChallengeCount: 0,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 0,
        resolutionChallengeBindingCount: 0,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
  } finally {
    await dispose(runtime, context);
  }
}

async function runChallengeReplay(runtime, prefix) {
  const context = await buildHandoff(
    runtime,
    prefix,
    (subject) =>
      subject.valueStatus === "PRESENT" &&
      subject.evidenceKind === "energy_bill_or_contract" &&
      subject.factKey === "partyName",
    () => "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  );
  try {
    const items = context.current.handoff.items;
    assert(
      items.length === 2 && context.requiredMissingFactKeys.has("midNumber") &&
        items.every((item) =>
          item.responseRequirement === "VALUE_PLUS_DOCUMENT_REPLACEMENT"
        ),
      "challenge_replay_required_items_invalid",
    );
    const energyTarget = items.find((item) =>
      item.documentLabel === "Energiedocument"
    ).replacementTarget.replacementTargetRef;
    const invoiceTarget = items.find((item) =>
      item.documentLabel === "Installatiefactuur"
    ).replacementTarget.replacementTargetRef;
    assert(
      energyTarget !== invoiceTarget &&
        items.some((item) =>
          item.factKey === "partyName" &&
          item.documentLabel === "Energiedocument" &&
          item.replacementTarget.replacementTargetRef === energyTarget
        ) &&
        items.some((item) =>
          item.factKey === "midNumber" &&
          item.documentLabel === "Installatiefactuur" &&
          item.replacementTarget.replacementTargetRef === invoiceTarget
        ),
      "challenge_replay_primary_targets_invalid",
    );
    const energyCandidate = await stage(
      runtime,
      context,
      "challenge_replay_energy",
      energyTarget,
      "challenge-replay-energy",
      [
        "Energieleverancier:Proof Supplier",
        "Contracthouder:Proof Person Corrected",
        "Leveradres:New Proofstraat 34",
        "Postcode:1234AB Proefstad",
        "Elektriciteit 871685900012345678",
      ],
    );
    assertTargetScopedCandidate(
      "challenge_replay_energy",
      energyCandidate,
      items,
      energyTarget,
    );
    const invoiceCandidate = await stage(
      runtime,
      context,
      "challenge_replay_invoice",
      invoiceTarget,
      "challenge-replay-invoice",
      CURRENT_INSTALLATION_DOCUMENT_LINES,
    );
    assertTargetScopedCandidate(
      "challenge_replay_invoice",
      invoiceCandidate,
      items,
      invoiceTarget,
    );
    const candidates = new Map([
      [energyTarget, energyCandidate.candidateRef],
      [invoiceTarget, invoiceCandidate.candidateRef],
    ]);
    const responses = responsesFor(items, candidates);
    const resolutions = factResolutionsFor(items, candidates);
    assertSubmissionContract(
      "challenge_replay_current_candidates",
      items,
      responses,
      resolutions,
    );
    const challengeKey = `${context.f.prefix}-challenge-replay`;
    const issued = await challenge(
      runtime,
      context,
      "challenge-replay",
      responses,
      resolutions,
    );
    const beforeReplayEnergy = assertTargetPhaseIdempotency(
      runtime,
      context,
      "challenge_replay_energy_issued",
      energyCandidate,
      challengeKey,
      null,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
    const beforeReplayInvoice = assertTargetPhaseIdempotency(
      runtime,
      context,
      "challenge_replay_invoice_issued",
      invoiceCandidate,
      challengeKey,
      null,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
    const replay = await requestCorrectionChallenge(
      runtime,
      context.f,
      context.auth.token,
      challengeKey,
      responses,
      "Proof Person",
      resolutions,
    );
    assert(
      replay.status === 200 &&
        replay.body?.challenge_reference === issued.body.challenge_reference,
      "challenge_exact_replay_failed",
    );
    const afterReplayEnergy = assertTargetPhaseIdempotency(
      runtime,
      context,
      "challenge_replay_energy_reused",
      energyCandidate,
      challengeKey,
      null,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
    const afterReplayInvoice = assertTargetPhaseIdempotency(
      runtime,
      context,
      "challenge_replay_invoice_reused",
      invoiceCandidate,
      challengeKey,
      null,
      {
        challengeCount: 1,
        deliveredChallengeCount: 1,
        replacedChallengeCount: 0,
        consumedChallengeCount: 0,
        signerChallengeBindingCount: 1,
        resolutionChallengeBindingCount: 1,
        submissionCount: 0,
        signerEvidenceBindingCount: 0,
        submissionItemCount: 0,
        submissionReplacementCount: 0,
        factResolutionCount: 0,
      },
    );
    assert(
      JSON.stringify(afterReplayEnergy) ===
          JSON.stringify(beforeReplayEnergy) &&
        JSON.stringify(afterReplayInvoice) ===
          JSON.stringify(beforeReplayInvoice) &&
        afterReplayEnergy.challengeDeliveryFingerprint !== "" &&
        afterReplayInvoice.challengeDeliveryFingerprint !== "",
      "challenge_replay_mutated_delivery_or_binding",
    );
  } finally {
    await dispose(runtime, context);
  }
}

async function runProof(kind) {
  const runtime = localRuntime();
  const run = `customer04c3b2-${kind}-${Date.now()}-${
    crypto.randomUUID().slice(0, 8)
  }`;
  const beforePilot = pilotState(runtime);
  const beforeFingerprint = relevantFingerprint(runtime);
  assertStaticTargetScopePlan();
  assertServerNormalizedValues(
    runtime,
    "proof_value_preflight",
    [
      ...Object.values(TARGET_SCOPE_PLAN).flatMap((plan) =>
        Object.entries(plan.observedValues).map(([factKey, value]) => ({
          factKey,
          value,
          expected: value,
        }))
      ),
      {
        factKey: "partyName",
        value: "Manual Customer Declaration",
        expected: "Manual Customer Declaration",
      },
    ],
  );
  if (kind === "upload-candidate") {
    await runUploadCandidate(runtime, `${run}-upload`);
  } else if (kind === "challenge-replay") {
    await runChallengeReplay(runtime, `${run}-challenge`);
  } else if (kind === "finalize-reentry") {
    await runValuePlusDocument(runtime, `${run}-combined`);
    await runDocumentOnly(runtime, `${run}-document`);
    await runParserMiss(runtime, `${run}-miss`);
  } else if (kind === "transactional-rollback") {
    await runFailureAtomicity(runtime, `${run}-atomic`);
  } else {
    throw new Error(`unknown_proof_kind_${kind}`);
  }
  assert(
    relevantFingerprint(runtime) === beforeFingerprint,
    "database_fingerprint_changed",
  );
  assert(pilotState(runtime) === beforePilot, "pilot_changed_by_c3b2_proof");
  process.stdout.write(
    [
      `SERVED_DOCUMENT_FINALIZATION_PHASE=${kind}`,
      "SERVED_PROOF_VALUE_NORMALIZATION=PASS",
      "SERVED_NAMED_PHASE_STATE=PASS",
      `CUSTOMER04C3B2_SERVED_${kind.toUpperCase().replaceAll("-", "_")}=PASS`,
    ].join("\n") + "\n",
  );
}

async function runAllProofs() {
  for (
    const kind of [
      "upload-candidate",
      "challenge-replay",
      "finalize-reentry",
      "transactional-rollback",
    ]
  ) {
    await runProof(kind);
  }
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runAllProofs().catch((error) => {
    process.stderr.write(
      `CUSTOMER04C3B2_SERVED_PROOF=FAIL:${scrub(error?.message ?? error)}\n`,
    );
    process.exitCode = 1;
  });
}

export { assertStaticTargetScopePlan, runProof };
