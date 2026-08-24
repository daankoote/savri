#!/usr/bin/env node

// CUSTOMER04C3C10 local served proof. Every case, Auth user, private Storage
// object and immutable routing row is disposable and removed before exit.

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
  localRuntime,
  pilotState,
  psql,
  publishCorrection,
  readCustomerHandoff,
  readDetail,
  relevantFingerprint,
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

const ENERGY = "energy_bill_or_contract";
const INSTALLATION = "installation_invoice";

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

async function buildContext(runtime, prefix, sourceKinds) {
  const auth = await createAuth(runtime, prefix);
  const f = fixture(prefix, auth.userId);
  try {
    const authority = setupFixture(runtime, f, "admin");
    grantCustomerAccess(runtime, f);
    grantPublishScope(runtime, f, authority);
    grantSupersedeScope(runtime, f, authority);
    const detail = await readDetail(runtime, f, auth.token);
    const selected = detail.reviewSubjects.filter((subject) =>
      subject.factKey === "partyName" && sourceKinds.has(subject.evidenceKind)
    );
    assert(
      selected.length === sourceKinds.size &&
        selected.every((subject) => subject.valueStatus === "PRESENT"),
      "party_name_review_subjects_missing",
    );
    const selectedRefs = new Set(selected.map((subject) => subject.subjectRef));
    const round = await finalize(runtime, auth.token, `${prefix}-round`, {
      caseRef: f.caseRef,
      manifestVersion: detail.reviewManifestVersion,
      manifestHash: detail.reviewManifestHash,
      decisions: detail.reviewSubjects.map((subject) =>
        selectedRefs.has(subject.subjectRef)
          ? {
            subjectRef: subject.subjectRef,
            disposition: "CORRECTION_REQUIRED",
            correctionReason: "INCORRECT_INFORMATION",
            correctionInstruction: "Lever de gecorrigeerde naam aan.",
          }
          : { subjectRef: subject.subjectRef, disposition: "ACCEPTED" }
      ),
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
      initial.status === 200 &&
        initial.body?.handoff?.items?.length === selected.length,
      "initial_customer_handoff_missing",
    );
    return { auth, f, authority, initial: initial.body };
  } catch (error) {
    await dispose(runtime, { auth, f });
    throw error;
  }
}

async function requireDocuments(runtime, context) {
  const items = context.initial.handoff.items;
  const superseded = await supersedeCorrection(
    runtime,
    context.f,
    context.auth.token,
    `${context.f.prefix}-supersede`,
    context.initial.handoff.handoffRef,
    items.map((item) => ({
      itemRef: item.itemRef,
      responseRequirement: "VALUE_PLUS_DOCUMENT_REPLACEMENT",
    })),
    "NEW_EVIDENCE_REQUIRED",
  );
  assert(superseded.status === 201, "document_handoff_supersession_failed");
  const current = await readCustomerHandoff(
    runtime,
    context.f,
    context.auth.token,
  );
  assert(
    current.status === 200 &&
      current.body?.handoff?.items?.length === items.length &&
      current.body.handoff.items.every((item) => item.replacementTarget),
    "document_handoff_projection_missing",
  );
  context.current = current.body;
}

async function stage(runtime, context, targetRef, suffix, bytes) {
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
  const party = confirmed.body?.parserObservation?.observedFacts?.find((fact) =>
    fact.factKey === "partyName" && fact.status === "observed"
  );
  assert(
    confirmed.status === 200 && confirmed.body?.candidateRef && party,
    `${suffix}_party_name_parse_failed`,
  );
  const parserProfile = confirmed.body.parserObservation.parserProfile;
  const extractionMethod = party.extractionMethod;
  const relationship = psql(
    runtime,
    `begin read only; select
    public.app_customer_correction_source_relationship_v1(
      'partyName','${parserProfile}','${extractionMethod}'
    ); rollback;`,
  );
  return {
    candidateRef: confirmed.body.candidateRef,
    observedValue: party.observedValue,
    relationship,
  };
}

function documentKind(item) {
  return item.documentLabel === "Energiedocument" ? ENERGY : INSTALLATION;
}

async function submit(runtime, context, resolutionType, value, candidates) {
  const items = (context.current ?? context.initial).handoff.items;
  const responses = items.map((item) => {
    const candidate = candidates.get(documentKind(item));
    return {
      itemRef: item.itemRef,
      correctedValue: value,
      ...(candidate ? { replacementCandidateRef: candidate.candidateRef } : {}),
    };
  });
  const sources = [...candidates.entries()].map(([kind, candidate]) => ({
    candidateRef: candidate.candidateRef,
    relationship: candidate.relationship,
    selected: resolutionType === "SOURCE_CONFLICT_SELECTED" && kind === ENERGY,
  }));
  const factResolutions = [{
    itemRefs: items.map((item) => item.itemRef),
    resolutionType,
    sources,
  }];
  const responseJson = JSON.stringify(responses).replaceAll("'", "''");
  const resolutionJson = JSON.stringify(factResolutions).replaceAll("'", "''");
  const basePrepared = JSON.parse(psql(
    runtime,
    `begin read only; select
    public.app_customer_correction_prepare_v2(
      '${context.f.authUserId}','${context.f.caseRef}',
      '${responseJson}'::jsonb
    )::text; rollback;`,
  ));
  assert(
    basePrepared.ok === true,
    `base_prepare_failed_${basePrepared.code ?? "none"}`,
  );
  const prepared = JSON.parse(psql(
    runtime,
    `begin read only; select
    public.app_customer_correction_fact_resolution_prepare_v1(
      '${context.f.authUserId}','${context.f.caseRef}',
      '${responseJson}'::jsonb,'${resolutionJson}'::jsonb
    )::text; rollback;`,
  ));
  assert(
    prepared.ok === true,
    `resolution_prepare_failed_${prepared.code ?? "none"}_items_${
      basePrepared.items?.length ?? 0
    }_scopes_${
      basePrepared.items?.filter((item) => item.scope_ref).length ?? 0
    }_distinct_scopes_${
      new Set(basePrepared.items?.map((item) => item.scope_ref)).size
    }_distinct_facts_${
      new Set(basePrepared.items?.map((item) => item.fact_key)).size
    }_distinct_values_${
      new Set(basePrepared.items?.map((item) => item.corrected_value)).size
    }`,
  );
  const issued = await requestCorrectionChallenge(
    runtime,
    context.f,
    context.auth.token,
    `${context.f.prefix}-challenge`,
    responses,
    "Proof Person",
    factResolutions,
  );
  assert(
    issued.status === 201 && issued.body?.challenge_reference,
    `challenge_failed_${issued.status}_${issued.body?.code ?? "none"}`,
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
  assert(
    finalized.status === 201 && finalized.body?.fact_resolution_count === 1,
    `finalize_failed_${finalized.status}_${finalized.body?.code ?? "none"}`,
  );
}

function persisted(runtime, context) {
  return psql(
    runtime,
    `begin read only; select concat_ws('|',
    resolution.customer_resolution_type,
    resolution.evidence_strength,
    resolution.independent_source_count,
    resolution.distinct_normalized_value_count,
    resolution.requires_enval_attention,
    resolution.downstream_verification_bypass_allowed,
    (select count(*)
      from public.app_evidence_review_customer_submission_fact_resolution_sources source
      where source.fact_resolution_id=resolution.id),
    (select count(*)
      from public.app_evidence_review_round_subject_decisions decision
      join public.app_evidence_review_rounds round_row
        on round_row.id=decision.round_id
      where round_row.case_id='${context.f.caseId}'
        and decision.disposition='HUMAN_ACCEPTED')
  ) from public.app_evidence_review_customer_submission_fact_resolutions resolution
  join public.app_evidence_review_customer_submissions submission
    on submission.id=resolution.submission_id
  where submission.case_id='${context.f.caseId}'; rollback;`,
  );
}

function energyPdf(name) {
  return pdf([
    "Energieleverancier: Route Energie B.V.",
    `Contracthouder: ${name}`,
    "Leveradres: Routeweg 10",
    "Postcode: 1234AB Proefstad",
    "Elektriciteit 871685900012345678",
  ]);
}

function installationPdf(name) {
  return pdf([
    "Installateur: Route Installatie B.V.",
    `Klant: ${name}`,
    "Factuuradres: Routeweg 10",
    "Postcode: 1234AB Proefstad",
    "Merk: Route Merk",
    "Model: Route Model",
    "MID: 123456789",
    "Serienummer: ROUTE2026",
  ]);
}

function combinedPdf(name) {
  return pdf([
    "Energieleverancier: Route Energie B.V.",
    `Contracthouder: ${name}`,
    "Leveradres: Routeweg 10",
    "Postcode: 1234AB Proefstad",
    "Elektriciteit 871685900012345678",
    "Installateur: Route Installatie B.V.",
    `Klant: ${name}`,
    "Factuuradres: Routeweg 10",
    "Merk: Route Merk",
    "Model: Route Model",
    "MID: 123456789",
    "Serienummer: ROUTE2026",
  ]);
}

async function runScenario(runtime, prefix, kind) {
  const twoSources = kind === "multi" || kind === "duplicate" ||
    kind === "conflict";
  const context = await buildContext(
    runtime,
    prefix,
    new Set(twoSources ? [ENERGY, INSTALLATION] : [ENERGY]),
  );
  try {
    if (kind === "manual") {
      await submit(runtime, context, "MANUAL", "Manual Route Name", new Map());
      assert(
        persisted(runtime, context) === "MANUAL|NO_SOURCE|0|0|t|f|0|0",
        "manual_route_not_persisted",
      );
      return;
    }
    await requireDocuments(runtime, context);
    const candidates = new Map();
    const items = context.current.handoff.items;
    const energyTarget = items.find((item) => documentKind(item) === ENERGY)
      .replacementTarget.replacementTargetRef;
    if (kind === "single") {
      const value = "Single Route Name";
      candidates.set(
        ENERGY,
        await stage(runtime, context, energyTarget, "energy", energyPdf(value)),
      );
      await submit(runtime, context, "SOURCE_CONFIRMED", value, candidates);
      assert(
        persisted(runtime, context) ===
          "SOURCE_CONFIRMED|SINGLE_SOURCE|1|1|f|f|1|0",
        "single_source_route_not_persisted",
      );
      return;
    }
    const installationTarget = items.find((item) =>
      documentKind(item) === INSTALLATION
    ).replacementTarget.replacementTargetRef;
    if (kind === "duplicate") {
      const value = "Duplicate Route Name";
      const bytes = combinedPdf(value);
      candidates.set(
        ENERGY,
        await stage(runtime, context, energyTarget, "energy", bytes),
      );
      candidates.set(
        INSTALLATION,
        await stage(
          runtime,
          context,
          installationTarget,
          "installation",
          bytes,
        ),
      );
      assert(
        [...candidates.values()].every((candidate) =>
          candidate.relationship === "direct" ||
          candidate.relationship === "supporting"
        ),
        "duplicate_source_relationship_projection_invalid",
      );
      await submit(runtime, context, "SOURCE_CONFIRMED", value, candidates);
      assert(
        persisted(runtime, context) ===
          "SOURCE_CONFIRMED|SINGLE_SOURCE|1|1|f|f|2|0",
        "duplicate_sha_increased_source_strength",
      );
      return;
    }
    const energyName = kind === "conflict"
      ? "Conflict Route Alpha"
      : "Equal Route Name";
    const installationName = kind === "conflict"
      ? "Conflict Route Beta"
      : energyName;
    candidates.set(
      ENERGY,
      await stage(
        runtime,
        context,
        energyTarget,
        "energy",
        energyPdf(energyName),
      ),
    );
    candidates.set(
      INSTALLATION,
      await stage(
        runtime,
        context,
        installationTarget,
        "installation",
        installationPdf(installationName),
      ),
    );
    assert(
      candidates.get(ENERGY)?.relationship === "direct" &&
        candidates.get(INSTALLATION)?.relationship === "supporting",
      `source_relationship_projection_invalid_${
        candidates.get(ENERGY)?.relationship ?? "none"
      }_${candidates.get(INSTALLATION)?.relationship ?? "none"}`,
    );
    await submit(
      runtime,
      context,
      kind === "conflict" ? "SOURCE_CONFLICT_SELECTED" : "SOURCE_CONFIRMED",
      energyName,
      candidates,
    );
    assert(
      persisted(runtime, context) ===
        (kind === "conflict"
          ? "SOURCE_CONFLICT_SELECTED|SOURCE_CONFLICT|2|2|t|f|2|0"
          : "SOURCE_CONFIRMED|MULTI_SOURCE_MATCH|2|1|f|f|2|0"),
      `${kind}_route_not_persisted`,
    );
  } finally {
    await dispose(runtime, context);
  }
}

async function main() {
  const runtime = localRuntime();
  const run = `customer04c3c10-${Date.now()}-${
    crypto.randomUUID().slice(0, 8)
  }`;
  const beforePilot = pilotState(runtime);
  const beforeFingerprint = relevantFingerprint(runtime);
  for (const kind of ["single", "multi", "duplicate", "conflict", "manual"]) {
    await runScenario(runtime, `${run}-${kind}`, kind);
  }
  assert(pilotState(runtime) === beforePilot, "pilot_changed_by_routing_proof");
  assert(
    relevantFingerprint(runtime) === beforeFingerprint,
    "database_fingerprint_changed_by_routing_proof",
  );
  process.stdout.write(
    [
      "SOURCE_CONFIRMED_SINGLE_SOURCE=PASS",
      "SOURCE_CONFIRMED_MULTI_SOURCE_MATCH=PASS",
      "SAME_CONTENT_SHA_SINGLE_SOURCE=PASS",
      "SOURCE_CONFLICT_SELECTED_SOURCE_CONFLICT=PASS",
      "MANUAL_ROUTE=PASS",
      "REQUIRED_VERIFICATION_BYPASS=NO",
      "HUMAN_ACCEPTED_CREATED=NO",
      "ROUTING_FIXTURE_CLEANUP=PASS",
      "ROUTING_PILOT_INTEGRITY=PASS",
      "CUSTOMER04C3C10_SERVED_Q01_Q07=PASS",
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(
    `CUSTOMER04C3C10_SERVED_PROOF=FAIL:${scrub(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
});
