#!/usr/bin/env node

// LOCAL_SERVICE proof over one disposable customer/workforce case. It exercises
// the actual Edge upload URL, private Storage PUT, confirm and shared parser
// path, then removes the isolated fixture and private objects.

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  assert,
  cleanupFixture,
  createAuth,
  deleteAuth,
  finalize,
  fixture,
  grantCustomerAccess,
  grantPublishScope,
  jsonRequest,
  localRuntime,
  pilotState,
  psql,
  publishCorrection,
  readCustomerHandoff,
  readDetail,
  readWorklist,
  relevantFingerprint,
  residueCount,
  scrub,
  setupFixture,
} from "./app-evidence-fact-review-round-served.proof.mjs";
import {
  grantSupersedeScope,
  supersedeCorrection,
} from "./app-correction-handoff-supersession-served.proof.mjs";

function pdf(lines) {
  const hex = (value) =>
    Array.from(new TextEncoder().encode(value))
      .map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  const stream = [
    "BT",
    "/F1 12 Tf",
    ...lines.flatMap((line, index) => [
      `1 0 0 1 72 ${720 - index * 20} Tm`,
      `<${hex(line)}> Tj`,
    ]),
    "ET",
  ].join("\n");
  return new TextEncoder().encode([
    "%PDF-1.4",
    "1 0 obj",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "endobj",
    "2 0 obj",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "endobj",
    "3 0 obj",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "endobj",
    "4 0 obj",
    `<< /Length ${stream.length} >>`,
    "stream",
    stream,
    "endstream",
    "endobj",
    "5 0 obj",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "endobj",
    "%%EOF",
  ].join("\n"));
}

function proofHeaders(runtime, token, idempotencyKey) {
  return {
    apikey: runtime.anonKey,
    Authorization: `Bearer ${token}`,
    Origin: "http://127.0.0.1:5175",
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    "X-Request-ID": `${idempotencyKey}-request`,
  };
}

async function post(runtime, token, endpoint, idempotencyKey, body) {
  return await jsonRequest(`${runtime.apiUrl}/functions/v1/${endpoint}`, {
    method: "POST",
    headers: proofHeaders(runtime, token, idempotencyKey),
    body: JSON.stringify(body),
  });
}

async function issueUpload(runtime, f, token, key, targetRef, bytes) {
  return await post(
    runtime,
    token,
    "api-app-customer-correction-upload-url",
    key,
    {
      caseRef: f.caseRef,
      replacementTargetRef: targetRef,
      fileName: "replacement.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.byteLength,
    },
  );
}

async function putSignedUpload(runtime, authToken, signedUrl, bytes) {
  const uploadUrl = new URL(signedUrl);
  const localGateway = new URL(runtime.apiUrl);
  assert(
    ["kong", "127.0.0.1", "localhost"].includes(uploadUrl.hostname) &&
      uploadUrl.pathname.startsWith("/storage/v1/object/upload/sign/") &&
      uploadUrl.searchParams.has("token"),
    "signed_upload_url_not_local_or_exact",
  );
  uploadUrl.protocol = localGateway.protocol;
  uploadUrl.hostname = localGateway.hostname;
  uploadUrl.port = localGateway.port;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      apikey: runtime.anonKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/pdf",
      "cache-control": "max-age=3600",
      "x-upsert": "false",
    },
    body: bytes,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const diagnostic = (await response.text()).replace(/[^a-zA-Z0-9_: -]/g, "")
      .slice(0, 160);
    throw new Error(`signed_upload_failed_${response.status}_${diagnostic}`);
  }
}

async function confirmUpload(runtime, f, token, key, uploadRef) {
  return await post(
    runtime,
    token,
    "api-app-customer-correction-upload-confirm",
    key,
    { caseRef: f.caseRef, uploadRef },
  );
}

function coreTruth(runtime, f) {
  return psql(
    runtime,
    `begin read only;
    with manifest as (
      select public.app_evidence_fact_review_manifest_v1('${f.caseId}') value
    ), current_handoff as (
      select public.app_evidence_review_current_correction_handoff_v1(
        '${f.caseId}', manifest.value->>'manifest_version',
        manifest.value->>'manifest_hash'
      ) id from manifest
    ) select concat_ws('|',
      (select count(*) from public.app_evidence_versions version
       join public.app_evidence_files file on file.id=version.evidence_file_id
       where file.case_id='${f.caseId}'),
      (select pg_catalog.encode(extensions.digest(
        pg_catalog.string_agg(version.id::text || ':' || version.sha256,','
          order by version.id),'sha256'),'hex')
       from public.app_evidence_versions version
       join public.app_evidence_files file on file.id=version.evidence_file_id
       where file.case_id='${f.caseId}'),
      (select count(*) from public.app_signup_signing_snapshots
       where id='${f.snapshotId}'),
      (select value->>'manifest_version' from manifest),
      (select value->>'manifest_hash' from manifest),
      (select count(*) from public.app_evidence_review_round_subject_decisions d
       join public.app_evidence_review_rounds r on r.id=d.round_id
       where r.case_id='${f.caseId}'),
      public.app_evidence_review_overall_status_v1(
        '${f.caseId}', (select value->>'manifest_version' from manifest),
        (select value->>'manifest_hash' from manifest)
      ),
      (select handoff_reference
       from public.app_evidence_review_correction_handoffs
       where id=(select id from current_handoff))
    ); rollback;`,
  );
}

function stagedCounts(runtime, f) {
  return psql(
    runtime,
    `begin read only; select concat_ws('|',
      (select count(*) from public.app_customer_correction_replacement_uploads
       where case_id='${f.caseId}'),
      (select count(*) from public.app_customer_correction_replacement_candidates
       where case_id='${f.caseId}'),
      (select count(*) from public.app_parser_observation_envelopes observation
       join public.app_customer_correction_replacement_candidates candidate
         on candidate.id=observation.correction_replacement_candidate_id
       where candidate.case_id='${f.caseId}')
    ); rollback;`,
  );
}

function currentResolution(runtime, f) {
  const raw = psql(
    runtime,
    `begin read only; select public.app_customer_correction_replacement_resolution_v1(
      '${f.authUserId}','${f.caseRef}'
    )::text; rollback;`,
  );
  return JSON.parse(raw);
}

function storagePaths(runtime, f) {
  const raw = psql(
    runtime,
    `begin read only; select coalesce(pg_catalog.jsonb_agg(storage_path), '[]')
     from public.app_customer_correction_replacement_uploads
     where case_id='${f.caseId}'; rollback;`,
  );
  return JSON.parse(raw);
}

async function deleteStoragePaths(runtime, paths) {
  if (paths.length === 0) return;
  const response = await fetch(
    `${runtime.apiUrl}/storage/v1/object/app-documents`,
    {
      method: "DELETE",
      headers: {
        apikey: runtime.serviceRoleKey,
        Authorization: `Bearer ${runtime.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: paths }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`storage_cleanup_failed_${response.status}`);
  }
}

async function main() {
  const runtime = localRuntime();
  const prefix = `customer04c3b1-${Date.now()}-${
    crypto.randomUUID().slice(0, 8)
  }`;
  const beforePilot = pilotState(runtime);
  const beforeFingerprint = relevantFingerprint(runtime);
  let auth = null;
  let f = null;
  let proofError = null;
  let cleanupError = null;
  let paths = [];
  try {
    auth = await createAuth(runtime, prefix);
    f = fixture(prefix, auth.userId);
    const authority = setupFixture(runtime, f, "admin");
    grantCustomerAccess(runtime, f);
    grantPublishScope(runtime, f, authority);
    grantSupersedeScope(runtime, f, authority);

    const detail = await readDetail(runtime, f, auth.token);
    const energyKeys = new Set([
      "partyName",
      "electricityEan",
      "structuredAddress",
    ]);
    const energySubjects = detail.reviewSubjects.filter((subject) =>
      subject.evidenceKind === "energy_bill_or_contract" &&
      energyKeys.has(subject.factKey)
    );
    const invoiceSubject = detail.reviewSubjects.find((subject) =>
      subject.evidenceKind === "installation_invoice"
    );
    assert(
      energySubjects.length === 3 && invoiceSubject,
      `disposable_multi_document_subjects_missing_${
        detail.reviewSubjects.map((subject) =>
          `${subject.evidenceKind}:${subject.factKey}`
        ).join(",")
      }`,
    );
    const selectedRefs = new Set([
      ...energySubjects.map((subject) => subject.subjectRef),
      invoiceSubject.subjectRef,
    ]);
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
    const finalized = await finalize(runtime, auth.token, `${prefix}-round`, {
      caseRef: f.caseRef,
      manifestVersion: detail.reviewManifestVersion,
      manifestHash: detail.reviewManifestHash,
      decisions,
    });
    assert(
      finalized.status === 201 &&
        finalized.body?.outcome === "CORRECTIONS_REQUIRED",
      "disposable_round_finalize_failed",
    );
    const published = await publishCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-publish`,
      finalized.body.roundRef,
    );
    assert(published.status === 201, "disposable_handoff_publish_failed");
    const customerA = await readCustomerHandoff(runtime, f, auth.token);
    assert(
      customerA.status === 200 && customerA.body?.handoff?.items?.length === 4,
      "disposable_initial_handoff_missing",
    );
    const requirementsB = customerA.body.handoff.items.map((item) => ({
      itemRef: item.itemRef,
      responseRequirement: item.documentLabel === "Energiedocument"
        ? "VALUE_PLUS_DOCUMENT_REPLACEMENT"
        : "DOCUMENT_REPLACEMENT",
    }));
    const createdB = await supersedeCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-supersede-b`,
      customerA.body.handoff.handoffRef,
      requirementsB,
      "NEW_EVIDENCE_REQUIRED",
    );
    assert(createdB.status === 201, "document_handoff_supersession_failed");
    const customerB = await readCustomerHandoff(runtime, f, auth.token);
    const itemsB = customerB.body?.handoff?.items ?? [];
    const energyItems = itemsB.filter((item) =>
      item.documentLabel === "Energiedocument"
    );
    const invoiceItems = itemsB.filter((item) =>
      item.documentLabel === "Installatiefactuur"
    );
    const energyTarget = energyItems[0]?.replacementTarget
      ?.replacementTargetRef;
    const invoiceTarget = invoiceItems[0]?.replacementTarget
      ?.replacementTargetRef;
    assert(
      customerB.status === 200 && energyItems.length === 3 &&
        invoiceItems.length === 1 &&
        energyItems.every((item) =>
          item.replacementTarget?.replacementTargetRef === energyTarget
        ) && energyTarget && invoiceTarget && energyTarget !== invoiceTarget &&
        itemsB.every((item) => item.replacementTarget),
      "server_target_grouping_or_projection_failed",
    );

    const coreBeforeStaging = coreTruth(runtime, f);
    const worklistBefore = await readWorklist(runtime, auth.token);
    assert(
      coreBeforeStaging.split("|")[6] === "WAITING_CUSTOMER" &&
        !worklistBefore.body?.cases?.some((row) => row.caseRef === f.caseRef),
      "pre_staging_status_invalid",
    );

    const invented = await issueUpload(
      runtime,
      f,
      auth.token,
      `${prefix}-invented`,
      `CRT-${"F".repeat(32)}`,
      pdf(["invented"]),
    );
    const otherCase = await post(
      runtime,
      auth.token,
      "api-app-customer-correction-upload-url",
      `${prefix}-other-case`,
      {
        caseRef: "CASE-000000000099",
        replacementTargetRef: energyTarget,
        fileName: "replacement.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      },
    );
    assert(
      invented.status === 404 && otherCase.status === 404,
      "unauthorized_target_or_case_not_denied",
    );

    const missPdf = pdf(["Document zonder gevraagde energiewaarden"]);
    const missIssue = await issueUpload(
      runtime,
      f,
      auth.token,
      `${prefix}-miss-issue`,
      energyTarget,
      missPdf,
    );
    assert(
      missIssue.status === 201 && missIssue.body?.uploadRef &&
        !missIssue.body.storagePath && !missIssue.body.storageBucket,
      "parser_miss_upload_issue_failed",
    );
    await putSignedUpload(
      runtime,
      auth.token,
      missIssue.body.signedUploadUrl,
      missPdf,
    );
    const missConfirm = await confirmUpload(
      runtime,
      f,
      auth.token,
      `${prefix}-miss-confirm`,
      missIssue.body.uploadRef,
    );
    assert(
      missConfirm.status === 200 && missConfirm.body?.candidateRef &&
        missConfirm.body?.status === "confirmed_staged" &&
        missConfirm.body?.parserSuccessRequiredForFinalCustomerValue ===
          false &&
        missConfirm.body?.parserObservation?.observedFacts?.every((fact) =>
          energyKeys.has(fact.factKey)
        ),
      "parser_miss_did_not_preserve_candidate",
    );

    const energyPdf = pdf([
      "Onze gegevens: New Supplier B.V.",
      "Contracthouder Proof Person",
      "Leveradres New Proofstraat 34",
      "Postcode 1234 AB Proefstad",
      "Elektriciteit 871685900012345678",
    ]);
    const energyIssue = await issueUpload(
      runtime,
      f,
      auth.token,
      `${prefix}-energy-issue`,
      energyTarget,
      energyPdf,
    );
    assert(energyIssue.status === 201, "energy_upload_issue_failed");
    await putSignedUpload(
      runtime,
      auth.token,
      energyIssue.body.signedUploadUrl,
      energyPdf,
    );
    const concurrent = await Promise.all([
      confirmUpload(
        runtime,
        f,
        auth.token,
        `${prefix}-energy-confirm-a`,
        energyIssue.body.uploadRef,
      ),
      confirmUpload(
        runtime,
        f,
        auth.token,
        `${prefix}-energy-confirm-b`,
        energyIssue.body.uploadRef,
      ),
    ]);
    assert(
      concurrent.every((result) => result.status === 200) &&
        new Set(concurrent.map((result) => result.body?.candidateRef)).size ===
          1 &&
        concurrent.every((result) =>
          result.body?.parserObservation?.parserProfile ===
            "energy_document_v1" &&
          result.body?.parserObservation?.observedFacts?.every((fact) =>
            energyKeys.has(fact.factKey)
          )
        ),
      "concurrent_confirm_or_safe_parser_projection_failed",
    );
    const retry = await confirmUpload(
      runtime,
      f,
      auth.token,
      `${prefix}-energy-confirm-retry`,
      energyIssue.body.uploadRef,
    );
    assert(
      retry.status === 200 &&
        retry.body?.candidateRef === concurrent[0].body?.candidateRef,
      "exact_confirm_retry_not_idempotent",
    );
    const exactCounts = psql(
      runtime,
      `begin read only; select concat_ws('|',
        (select count(*) from public.app_customer_correction_replacement_candidates candidate
         join public.app_customer_correction_replacement_uploads upload
           on upload.id=candidate.upload_id
         where upload.upload_reference='${energyIssue.body.uploadRef}'),
        (select count(*) from public.app_parser_observation_envelopes observation
         join public.app_customer_correction_replacement_candidates candidate
           on candidate.id=observation.correction_replacement_candidate_id
         join public.app_customer_correction_replacement_uploads upload
           on upload.id=candidate.upload_id
         where upload.upload_reference='${energyIssue.body.uploadRef}')
      ); rollback;`,
    );
    assert(exactCounts === "1|1", "duplicate_candidate_or_parser_truth");
    const resolutionB = currentResolution(runtime, f);
    assert(
      resolutionB.ok === true && resolutionB.targets.length === 2 &&
        resolutionB.targets.some((target) =>
          target.replacement_target_ref === energyTarget &&
          target.candidate_ref === retry.body.candidateRef &&
          target.parser_observation
        ),
      "c3b2_server_resolution_contract_failed",
    );
    const worklistAfter = await readWorklist(runtime, auth.token);
    assert(
      coreTruth(runtime, f) === coreBeforeStaging &&
        !worklistAfter.body?.cases?.some((row) => row.caseRef === f.caseRef) &&
        stagedCounts(runtime, f) === "2|2|2",
      "pre_finalize_core_truth_changed",
    );

    const stalePdf = pdf(["stale handoff upload"]);
    const staleIssue = await issueUpload(
      runtime,
      f,
      auth.token,
      `${prefix}-stale-issue`,
      energyTarget,
      stalePdf,
    );
    assert(staleIssue.status === 201, "stale_fixture_issue_failed");
    const requirementsC = itemsB.map((item) => ({
      itemRef: item.itemRef,
      responseRequirement: "VALUE_CORRECTION",
    }));
    const createdC = await supersedeCorrection(
      runtime,
      f,
      auth.token,
      `${prefix}-supersede-c`,
      customerB.body.handoff.handoffRef,
      requirementsC,
      "REQUIREMENT_CORRECTION",
    );
    assert(createdC.status === 201, "value_only_successor_failed");
    const staleUrl = await issueUpload(
      runtime,
      f,
      auth.token,
      `${prefix}-stale-url`,
      energyTarget,
      stalePdf,
    );
    const staleConfirm = await confirmUpload(
      runtime,
      f,
      auth.token,
      `${prefix}-stale-confirm`,
      staleIssue.body.uploadRef,
    );
    const customerC = await readCustomerHandoff(runtime, f, auth.token);
    const resolutionC = currentResolution(runtime, f);
    assert(
      staleUrl.status === 404 && [404, 409].includes(staleConfirm.status) &&
        customerC.body?.handoff?.items?.every((item) =>
          item.responseRequirement === "VALUE_CORRECTION" &&
          !item.replacementTarget
        ) && resolutionC.ok === true && resolutionC.targets.length === 0 &&
        resolutionC.all_required_candidates_confirmed === true,
      "stale_or_value_only_upload_authority_failed",
    );
    assert(
      coreTruth(runtime, f).split("|")[6] === "WAITING_CUSTOMER" &&
        stagedCounts(runtime, f) === "3|2|2",
      "stale_candidate_history_or_status_invalid",
    );
    paths = storagePaths(runtime, f);
  } catch (error) {
    proofError = error;
    if (f) paths = storagePaths(runtime, f);
  } finally {
    try {
      await deleteStoragePaths(runtime, paths);
    } catch (error) {
      cleanupError = error;
    }
    if (f) {
      try {
        cleanupFixture(runtime, f);
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
  }

  if (proofError) {
    if (cleanupError) {
      throw new Error(
        `${proofError?.message ?? proofError}:cleanup:${
          cleanupError?.message ?? cleanupError
        }`,
      );
    }
    throw proofError;
  }
  if (cleanupError) throw cleanupError;
  assert(!f || residueCount(runtime, f) === "0", "served_fixture_residue");
  assert(
    relevantFingerprint(runtime) === beforeFingerprint,
    "database_fingerprint_changed",
  );
  assert(pilotState(runtime) === beforePilot, "pilot_changed_by_proof");

  process.stdout.write(
    [
      "SERVED_REPLACEMENT_UPLOAD_FLOW=PASS",
      "SERVED_SHARED_PARSER_OBSERVATION=PASS",
      "SERVED_PARSER_MISS_PRESERVES_UPLOAD=PASS",
      "SERVED_SAME_DOCUMENT_MULTI_ITEM_ONE_TARGET=PASS",
      "SERVED_CROSS_DOCUMENT_DISTINCT_TARGETS=PASS",
      "SERVED_CONFIRM_IDEMPOTENT_CONCURRENT=PASS",
      "SERVED_STALE_HANDOFF_DENIED=PASS",
      "SERVED_PRE_FINALIZE_CORE_TRUTH_UNCHANGED=PASS",
      "SERVED_REPLACEMENT_PILOT_UNCHANGED=PASS",
      "CUSTOMER04C3B1_SERVED_Q01_Q09=PASS",
    ].join("\n") + "\n",
  );
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `CUSTOMER04C3B1_SERVED_PROOF=FAIL:${scrub(error?.message ?? error)}\n`,
    );
    process.exitCode = 1;
  });
}

export {
  confirmUpload,
  coreTruth,
  currentResolution,
  deleteStoragePaths,
  issueUpload,
  pdf,
  post,
  putSignedUpload,
  stagedCounts,
  storagePaths,
};
