import {
  createHandler,
  type EvidenceReviewDecisionHandlerDependencies,
  normalizeEvidenceReviewDecisionRequest,
} from "../../supabase/functions/api-app-evidence-review-decision/index.ts";
import type {
  AppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";

class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}

const AUTH = "a1000000-0000-4000-8000-000000000001";
const AUTH_VIEW_ONLY = "a1000000-0000-4000-8000-000000000002";
const AUTH_NO_SCOPE = "a1000000-0000-4000-8000-000000000003";
const AUTH_CUSTOMER = "a1000000-0000-4000-8000-000000000004";
const CASE_REF = "CASE-A00000000001";
const EVIDENCE_ACCEPT = "a2000000-0000-4000-8000-000000000001";
const EVIDENCE_CORRECT = "a2000000-0000-4000-8000-000000000002";
const EVIDENCE_FOREIGN = "a2000000-0000-4000-8000-000000000003";
const DECIDED_AT = "2026-08-18T12:00:00.000Z";
const EXPIRES = "2030-01-01T00:00:00.000Z";

type Decision = "ACCEPTED" | "CORRECTION_REQUIRED";
type DecisionRow = Readonly<{
  decision: Decision;
  decidedAt: string;
  correctionReason: string | null;
  correctionInstruction: string | null;
}>;
type RpcCall = Readonly<{ name: string; args: JsonObject }>;

function sourceEvidence(
  evidenceVersionRef: string,
  row?: DecisionRow,
): JsonObject {
  return {
    evidence_file_ref: evidenceVersionRef.replace("a200", "a300"),
    evidence_version_ref: evidenceVersionRef,
    kind: "energy_bill_or_contract",
    mime_type: "application/pdf",
    uploaded_at: "2026-08-18T10:00:00.000Z",
    sha256_present: true,
    review_status: row?.decision ?? "PENDING",
    decided_at: row?.decidedAt ?? null,
    correction_reason: row?.correctionReason ?? null,
    correction_instruction: row?.correctionInstruction ?? null,
    canonical_facts: [],
  };
}

function detailSource(rows: Map<string, DecisionRow>): JsonObject {
  return {
    ok: true,
    status: 200,
    code: "ok",
    as_of: "2026-08-18T12:00:00.000Z",
    case_context: {
      can_decide: true,
      case_ref: CASE_REF,
      lifecycle_state: "submitted_for_review",
      party_display_name: null,
      party_truth_class: null,
      delivery_address: null,
      delivery_address_truth_class: null,
    },
    evidence: [
      sourceEvidence(EVIDENCE_ACCEPT, rows.get(EVIDENCE_ACCEPT)),
      sourceEvidence(EVIDENCE_CORRECT, rows.get(EVIDENCE_CORRECT)),
    ],
  };
}

function request(
  evidenceVersionRef: string,
  decision: string,
  key: string,
  extras: JsonObject = {},
): Request {
  return new Request("https://enval.local/api-app-evidence-review-decision", {
    method: "POST",
    headers: {
      authorization: "Bearer proof-token",
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify({
      caseRef: CASE_REF,
      evidenceVersionRef,
      decision,
      ...extras,
    }),
  });
}

function responseCode(body: unknown): string | null {
  return body && typeof body === "object" && !Array.isArray(body) &&
      typeof (body as JsonObject).code === "string"
    ? (body as JsonObject).code as string
    : null;
}

function makeHarness(authUserId = AUTH) {
  const calls: RpcCall[] = [];
  const rows = new Map<string, DecisionRow>();
  const idempotency = new Map<string, JsonObject>();
  const client: ServiceClient = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({}),
    rpc: async (name, args) => {
      calls.push({ name, args });
      const auth = String(args.p_auth_user_id ?? "");
      if (auth === AUTH_CUSTOMER) {
        return {
          data: {
            ok: false,
            status: 403,
            code: "workforce_identity_missing",
          },
        };
      }
      if (auth === AUTH_NO_SCOPE) {
        return {
          data: { ok: false, status: 403, code: "case_scope_denied" },
        };
      }
      if (name === "app_evidence_review_case_detail_read_v3") {
        return { data: detailSource(rows) };
      }
      if (name === "app_evidence_review_decide_v2") {
        if (auth === AUTH_VIEW_ONLY) {
          return {
            data: {
              ok: false,
              status: 403,
              code: "capability_not_authorized",
            },
          };
        }
        const key = String(args.p_idempotency_key);
        const payloadHash = String(args.p_payload_sha256);
        const replay = idempotency.get(key);
        if (replay) {
          return replay.payload_hash === payloadHash
            ? { data: replay.response }
            : {
              data: {
                ok: false,
                status: 409,
                code: "idempotency_conflict",
              },
            };
        }
        const evidenceVersionRef = String(args.p_evidence_version_id);
        const existing = rows.get(evidenceVersionRef);
        if (existing) {
          return {
            data: {
              ok: false,
              status: 409,
              code: "evidence_already_decided",
            },
          };
        }
        const decision = args.p_decision as Decision;
        const correctionReason = args.p_correction_reason as string | null;
        const correctionInstruction = args.p_correction_instruction as
          | string
          | null;
        rows.set(evidenceVersionRef, {
          decision,
          decidedAt: DECIDED_AT,
          correctionReason,
          correctionInstruction,
        });
        const response: JsonObject = {
          ok: true,
          status: 201,
          code: "ok",
          evidence_version_id: evidenceVersionRef,
          review_decision_id: "a4000000-0000-4000-8000-000000000001",
          review_state: decision,
          correction_reason: correctionReason,
          correction_instruction: correctionInstruction,
          reviewer_workforce_identity_id: "must-not-leak",
          payload_sha256: "must-not-leak",
        };
        idempotency.set(key, { payload_hash: payloadHash, response });
        return { data: response };
      }
      if (name === "app_evidence_review_state_v1") {
        const evidenceVersionRef = String(args.p_evidence_version_id);
        const row = rows.get(evidenceVersionRef);
        return {
          data: {
            ok: true,
            status: 200,
            code: "ok",
            evidence_version_id: evidenceVersionRef,
            review_state: row?.decision ?? "PENDING",
            review_decision_id: row
              ? "a4000000-0000-4000-8000-000000000001"
              : null,
            decided_at: row?.decidedAt ?? null,
          },
        };
      }
      return { error: new Error("unexpected_rpc") };
    },
  };
  const dependencies: Partial<EvidenceReviewDecisionHandlerDependencies> = {
    createServiceClient: () => client,
    idempotencyExpiresAt: () => EXPIRES,
    requestMeta: async (req): Promise<AppRequestMeta> => ({
      request_id: req.headers.get("x-request-id") ?? "review11-proof-request",
      idempotency_key: req.headers.get("idempotency-key"),
      ip_hash: null,
      user_agent_hash: null,
      method: req.method,
      path: "/api-app-evidence-review-decision",
      url: req.url,
      origin: null,
      timestamp: "2026-08-18T12:00:00.000Z",
      environment: "local",
    }),
    hashPayload: async (payload) => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(payload)),
      );
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    },
    verifyBearer: async () => ({
      ok: true,
      context: {
        authUserId,
        emailNormalized: "proof@example.invalid",
      },
    }),
  };
  return { calls, rows, handler: createHandler(dependencies), dependencies };
}

async function json(response: Response): Promise<JsonObject> {
  return await response.json() as JsonObject;
}

try {
  assert(
    normalizeEvidenceReviewDecisionRequest({
      caseRef: CASE_REF,
      evidenceVersionRef: EVIDENCE_ACCEPT,
      decision: "ACCEPTED",
    })?.decision === "ACCEPTED",
    "valid_contract_rejected",
  );
  const normalizedCorrection = normalizeEvidenceReviewDecisionRequest({
    caseRef: CASE_REF,
    evidenceVersionRef: EVIDENCE_CORRECT,
    decision: "CORRECTION_REQUIRED",
    correctionReason: "WRONG_DOCUMENT",
    correctionInstruction: "  Lever het juiste document aan.  ",
  });
  assert(
    normalizedCorrection?.correctionReason === "WRONG_DOCUMENT" &&
      normalizedCorrection.correctionInstruction ===
        "Lever het juiste document aan.",
    "valid_correction_not_normalized",
  );
  for (
    const invalidCorrection of [
      {
        correctionInstruction: "Voeg informatie toe.",
      },
      {
        correctionReason: "MISSING_INFORMATION",
      },
      {
        correctionReason: "MISSING_INFORMATION",
        correctionInstruction: "   ",
      },
      {
        correctionReason: "UNKNOWN",
        correctionInstruction: "Voeg informatie toe.",
      },
      {
        correctionReason: "OTHER",
        correctionInstruction: "...",
      },
    ]
  ) {
    assert(
      normalizeEvidenceReviewDecisionRequest({
        caseRef: CASE_REF,
        evidenceVersionRef: EVIDENCE_CORRECT,
        decision: "CORRECTION_REQUIRED",
        ...invalidCorrection,
      }) === null,
      "invalid_correction_contract_accepted",
    );
  }
  for (
    const acceptedDetails of [
      { correctionReason: "OTHER" },
      { correctionInstruction: "Niet toegestaan." },
      {
        correctionReason: "OTHER",
        correctionInstruction: "Niet toegestaan.",
      },
    ]
  ) {
    assert(
      normalizeEvidenceReviewDecisionRequest({
        caseRef: CASE_REF,
        evidenceVersionRef: EVIDENCE_ACCEPT,
        decision: "ACCEPTED",
        ...acceptedDetails,
      }) === null,
      "accepted_correction_details_not_denied",
    );
  }
  for (const decision of ["PENDING", "APPROVED", "REJECTED", "accepted", ""]) {
    assert(
      normalizeEvidenceReviewDecisionRequest({
        caseRef: CASE_REF,
        evidenceVersionRef: EVIDENCE_ACCEPT,
        decision,
      }) === null,
      `decision_enum_open:${decision}`,
    );
  }
  for (
    const extra of [
      { reviewerId: AUTH },
      { tenantId: "enval" },
      { decidedAt: DECIDED_AT },
      { capability: "evidence.review.decide" },
      { canDecide: true },
      { note: "not-in-v1" },
    ]
  ) {
    assert(
      normalizeEvidenceReviewDecisionRequest({
        caseRef: CASE_REF,
        evidenceVersionRef: EVIDENCE_ACCEPT,
        decision: "ACCEPTED",
        ...extra,
      }) === null,
      "client_authority_or_note_accepted",
    );
  }

  const acceptedHarness = makeHarness();
  const accepted = await acceptedHarness.handler(
    request(EVIDENCE_ACCEPT, "ACCEPTED", "review11-accepted"),
  );
  const acceptedBody = await json(accepted);
  assert(
    accepted.status === 201 && acceptedBody.outcome === "RECORDED" &&
      acceptedBody.decision === "ACCEPTED" &&
      acceptedBody.decisionAt === DECIDED_AT &&
      Object.keys(acceptedBody).sort().join("|") ===
        "caseRef|decision|decisionAt|evidenceVersionRef|outcome|schemaVersion" &&
      !JSON.stringify(acceptedBody).includes("must-not-leak") &&
      acceptedHarness.calls.map((call) => call.name).join("|") ===
        "app_evidence_review_case_detail_read_v3|app_evidence_review_decide_v2|app_evidence_review_state_v1" &&
      acceptedHarness.calls[1].args.p_auth_user_id === AUTH &&
      acceptedHarness.calls[1].args.p_evidence_version_id === EVIDENCE_ACCEPT &&
      acceptedHarness.calls[1].args.p_decision === "ACCEPTED" &&
      !JSON.stringify(acceptedHarness.calls[1].args).includes("reviewer") &&
      acceptedHarness.rows.size === 1,
    "accepted_runtime_contract_failed",
  );

  const retry = await acceptedHarness.handler(
    request(EVIDENCE_ACCEPT, "ACCEPTED", "review11-accepted"),
  );
  const retryBody = await json(retry);
  assert(
    retry.status === 201 && retryBody.outcome === "ALREADY_RECORDED" &&
      acceptedHarness.rows.size === 1,
    "exact_retry_not_idempotent",
  );
  const conflict = await acceptedHarness.handler(
    request(EVIDENCE_ACCEPT, "CORRECTION_REQUIRED", "review11-conflict", {
      correctionReason: "MISSING_INFORMATION",
      correctionInstruction: "Voeg het ontbrekende gegeven toe.",
    }),
  );
  assert(
    conflict.status === 409 &&
      responseCode(await json(conflict)) === "evidence_already_decided" &&
      acceptedHarness.rows.get(EVIDENCE_ACCEPT)?.decision === "ACCEPTED",
    "conflicting_retry_not_closed",
  );

  const correctionHarness = makeHarness();
  const correction = await correctionHarness.handler(
    request(EVIDENCE_CORRECT, "CORRECTION_REQUIRED", "review12-correction", {
      correctionReason: "MISSING_INFORMATION",
      correctionInstruction: "  Voeg het ontbrekende gegeven toe.  ",
    }),
  );
  const correctionBody = await json(correction);
  assert(
    correction.status === 201 &&
      correctionBody.decision === "CORRECTION_REQUIRED" &&
      correctionHarness.rows.get(EVIDENCE_CORRECT)?.decision ===
        "CORRECTION_REQUIRED" &&
      correctionHarness.rows.get(EVIDENCE_CORRECT)?.correctionReason ===
        "MISSING_INFORMATION" &&
      correctionHarness.rows.get(EVIDENCE_CORRECT)?.correctionInstruction ===
        "Voeg het ontbrekende gegeven toe.",
    "correction_runtime_contract_failed",
  );
  const correctionRetry = await correctionHarness.handler(
    request(EVIDENCE_CORRECT, "CORRECTION_REQUIRED", "review12-correction", {
      correctionReason: "MISSING_INFORMATION",
      correctionInstruction: "Voeg het ontbrekende gegeven toe.",
    }),
  );
  assert(
    correctionRetry.status === 201 &&
      (await json(correctionRetry)).outcome === "ALREADY_RECORDED" &&
      correctionHarness.rows.size === 1,
    "correction_exact_retry_not_idempotent",
  );
  const changedReason = await correctionHarness.handler(
    request(EVIDENCE_CORRECT, "CORRECTION_REQUIRED", "review12-correction", {
      correctionReason: "INCORRECT_INFORMATION",
      correctionInstruction: "Voeg het ontbrekende gegeven toe.",
    }),
  );
  assert(
    changedReason.status === 409 &&
      responseCode(await json(changedReason)) === "idempotency_conflict",
    "changed_reason_replay_not_denied",
  );
  const changedInstruction = await correctionHarness.handler(
    request(EVIDENCE_CORRECT, "CORRECTION_REQUIRED", "review12-correction", {
      correctionReason: "MISSING_INFORMATION",
      correctionInstruction: "Lever een ander document aan.",
    }),
  );
  assert(
    changedInstruction.status === 409 &&
      responseCode(await json(changedInstruction)) === "idempotency_conflict",
    "changed_instruction_replay_not_denied",
  );

  for (
    const [auth, expectedCode] of [
      [AUTH_VIEW_ONLY, "capability_not_authorized"],
      [AUTH_NO_SCOPE, "case_scope_denied"],
      [AUTH_CUSTOMER, "workforce_identity_missing"],
    ] as const
  ) {
    const harness = makeHarness(auth);
    const denied = await harness.handler(
      request(EVIDENCE_ACCEPT, "ACCEPTED", `review11-denied-${auth.slice(-1)}`),
    );
    assert(
      denied.status === 403 &&
        responseCode(await json(denied)) === expectedCode &&
        harness.rows.size === 0,
      `authorization_not_closed:${expectedCode}`,
    );
  }

  const noAuthHarness = makeHarness();
  const noAuth = await createHandler({
    ...noAuthHarness.dependencies,
    verifyBearer: async () => ({
      ok: false,
      status: 401,
      code: "missing_authorization",
      message: "Niet geautoriseerd.",
    }),
  })(request(EVIDENCE_ACCEPT, "ACCEPTED", "review11-no-auth"));
  assert(
    noAuth.status === 401 && noAuthHarness.calls.length === 0,
    "unauthenticated_reached_database",
  );

  const gateHarness = makeHarness();
  const gated = await createHandler({
    ...gateHarness.dependencies,
    requestMeta: async () =>
      new Response(JSON.stringify({ ok: false, code: "tenant_gate_failed" }), {
        status: 503,
      }),
  })(request(EVIDENCE_ACCEPT, "ACCEPTED", "review11-gated"));
  assert(
    gated.status === 503 && gateHarness.calls.length === 0,
    "tenant_gate_not_first",
  );

  const foreignHarness = makeHarness();
  const foreign = await foreignHarness.handler(
    request(EVIDENCE_FOREIGN, "ACCEPTED", "review11-foreign"),
  );
  assert(
    foreign.status === 404 && foreignHarness.calls.length === 1 &&
      foreignHarness.rows.size === 0,
    "cross_case_or_unknown_evidence_reached_decision_rpc",
  );

  const invalidHarness = makeHarness();
  for (
    const invalidRequest of [
      request("not-a-uuid", "ACCEPTED", "review11-invalid-version"),
      request(EVIDENCE_ACCEPT, "PENDING", "review11-invalid-decision"),
      request(EVIDENCE_ACCEPT, "ACCEPTED", "review11-extra", {
        reviewerId: AUTH,
      }),
    ]
  ) {
    const invalid = await invalidHarness.handler(invalidRequest);
    assert(invalid.status === 400, "malformed_request_not_rejected");
  }
  assert(invalidHarness.calls.length === 0, "invalid_request_reached_database");

  console.log("EVIDENCE_REVIEW_DECISION_ENDPOINT_Q01_Q18=PASS");
  console.log("EVIDENCE_REVIEW_DECISION_EXACT_RETRY=PASS");
  console.log("EVIDENCE_REVIEW_DECISION_SECRET_FREE=PASS");
} catch (error) {
  console.error(
    `REVIEW11_PROOF_FAIL=${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  Deno.exitCode = 1;
}
