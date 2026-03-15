// supabase/functions/api-dossier-verify/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import {
  insertAuditFailOpen,
  tryGetIdempotentResponse,
  storeIdempotentResponseFailOpen,
} from "../_shared/audit.ts";
import {
  requireCustomerSession,
  scopedSessionIdemKey,
} from "../_shared/customer_auth.ts";
import {
  ANALYSIS_METHOD_CODE,
  ANALYSIS_METHOD_VERSION,
  assertConfirmedDocumentShape,
  buildChargerAnalysisRows,
  buildDocumentAnalysisRow,
  buildSummaryAnalysisRow,
  groupConfirmedDocsByCharger,
  isLockedOrReviewable,
  isSupportedDocType,
  sanitizeMode,
  type ChargerAnalysisRow,
  type ChargerRow,
  type DocumentAnalysisRow,
  type DocumentRow,
  type DossierRow,
} from "../_shared/analysis.ts";

// -------------------- CORS --------------------
function parseAllowedOrigins(): string[] {
  const raw =
    Deno.env.get("ALLOWED_ORIGINS") ??
    Deno.env.get("ALLOWED_ORIGIN") ??
    "https://www.enval.nl,https://enval.nl";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
const ALLOWED_ORIGINS = parseAllowedOrigins();

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : (ALLOWED_ORIGINS[0] || "https://www.enval.nl");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key, Idempotency-Key, x-request-id, X-Request-Id",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeadersFor(req) },
  });
}

function bad(
  req: Request,
  msg: string,
  code = 400,
  extra: Record<string, unknown> = {},
) {
  return json(req, code, { ok: false, error: msg, ...extra });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getEnvironment(): string {
  return (
    Deno.env.get("ENVIRONMENT") ||
    Deno.env.get("ENV") ||
    Deno.env.get("APP_ENV") ||
    "unknown"
  ).toLowerCase();
}

type SummaryInsertRow = {
  dossier_id: string;
  overall_status: string;
  method_code: string;
  method_version: string;
  summary: Record<string, unknown>;
  limitations: unknown[];
  created_at: string;
  updated_at: string;
};

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return bad(req, "Method not allowed", 405);
  }

  const idemKey = String(meta.idempotency_key || "").trim();
  if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

  let SB: ReturnType<typeof createClient>;
  try {
    SB = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  } catch (e) {
    console.error("ENV error:", e);
    return bad(req, "Server misconfigured (missing secrets)", 500);
  }

  const parsed = await req.json().catch(() => ({} as Record<string, unknown>));
  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
  const session_token = parsed?.session_token ? String(parsed.session_token) : null;

  let mode: "refresh";
  try {
    mode = sanitizeMode(parsed?.mode);
  } catch (e: any) {
    return bad(req, String(e?.message || e), 400);
  }

  if (!dossier_id || !session_token) {
    return json(req, 400, { ok: false, error: "Missing dossier_id/session_token" });
  }

  const auth = await requireCustomerSession(
    SB,
    dossier_id,
    session_token,
    meta,
    "dossier_verify_rejected",
  );

  if (!auth.ok) {
    return json(req, auth.status, { ok: false, error: auth.error });
  }

  const idemScopedKey = scopedSessionIdemKey(dossier_id, auth.session_token_hash, idemKey);
  const cached = await tryGetIdempotentResponse(SB, idemScopedKey);
  if (cached) return json(req, cached.status, cached.body);

  async function finalize(status: number, body: Record<string, unknown>) {
    await storeIdempotentResponseFailOpen(SB, idemScopedKey, status, body);
    return json(req, status, body);
  }

  async function auditReject(
    stage: string,
    status: number,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_verify_rejected",
        event_data: { stage, status, message, ...(extra || {}) },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );
  }

  async function reject(
    stage: string,
    status: number,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    await auditReject(stage, status, message, extra);
    return finalize(status, { ok: false, error: message, ...(extra || {}) });
  }

  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select([
      "id",
      "status",
      "locked_at",
      "address_postcode",
      "address_house_number",
      "address_suffix",
      "address_street",
      "address_city",
    ].join(","))
    .eq("id", dossier_id)
    .maybeSingle<DossierRow>();

  if (dErr) {
    return reject("dossier_lookup", 500, `Dossier read failed: ${dErr.message}`, {
      reason: "db_error",
    });
  }

  if (!dossier) {
    return reject("dossier_lookup", 404, "Dossier not found", {
      reason: "not_found",
    });
  }

  if (!isLockedOrReviewable(dossier.status, dossier.locked_at)) {
    return reject(
      "analysis_gate",
      409,
      "Analyse is alleen toegestaan voor dossiers die zijn ingediend (locked/in_review).",
      {
        reason: "not_locked",
        status: dossier.status || null,
        locked_at: dossier.locked_at || null,
      },
    );
  }

  const [
    { data: chargers, error: chErr },
    { data: docsRaw, error: docErr },
  ] = await Promise.all([
    SB.from("dossier_chargers")
      .select("id,dossier_id,serial_number,mid_number,brand,model,power_kw,notes,created_at,updated_at")
      .eq("dossier_id", dossier_id)
      .order("created_at", { ascending: true }),

    SB.from("dossier_documents")
      .select("id,dossier_id,doc_type,charger_id,status,filename,content_type,size_bytes,storage_bucket,storage_path,file_sha256,confirmed_at,created_at,updated_at")
      .eq("dossier_id", dossier_id)
      .eq("status", "confirmed")
      .order("created_at", { ascending: true }),
  ]);

  if (chErr) {
    return reject("chargers_read", 500, `Chargers read failed: ${chErr.message}`, {
      reason: "db_error",
    });
  }

  if (docErr) {
    return reject("documents_read", 500, `Documents read failed: ${docErr.message}`, {
      reason: "db_error",
    });
  }

  const chargerRows = (chargers || []) as ChargerRow[];
  const confirmedDocs = (docsRaw || []) as DocumentRow[];

  for (const doc of confirmedDocs) {
    try {
      assertConfirmedDocumentShape(doc);
    } catch (e: any) {
      return reject("document_shape", 409, String(e?.message || e), {
        reason: "bad_document_shape",
        document_id: doc.id,
      });
    }
  }

  // refresh mode = clear previous rows for exact method version, then rebuild
  if (mode === "refresh") {
    const [{ error: delDocErr }, { error: delChErr }, { error: delSumErr }] =
      await Promise.all([
        SB.from("dossier_analysis_document")
          .delete()
          .eq("dossier_id", dossier_id)
          .eq("method_code", ANALYSIS_METHOD_CODE)
          .eq("method_version", ANALYSIS_METHOD_VERSION),

        SB.from("dossier_analysis_charger")
          .delete()
          .eq("dossier_id", dossier_id)
          .eq("method_code", ANALYSIS_METHOD_CODE)
          .eq("method_version", ANALYSIS_METHOD_VERSION),

        SB.from("dossier_analysis_summary")
          .delete()
          .eq("dossier_id", dossier_id)
          .eq("method_code", ANALYSIS_METHOD_CODE)
          .eq("method_version", ANALYSIS_METHOD_VERSION),
      ]);

    if (delDocErr) {
      return reject("analysis_refresh_delete_document", 500, delDocErr.message, {
        reason: "db_error",
      });
    }
    if (delChErr) {
      return reject("analysis_refresh_delete_charger", 500, delChErr.message, {
        reason: "db_error",
      });
    }
    if (delSumErr) {
      return reject("analysis_refresh_delete_summary", 500, delSumErr.message, {
        reason: "db_error",
      });
    }
  }

  const supportedDocs = confirmedDocs.filter((d) =>
    isSupportedDocType(String(d.doc_type || "").trim())
  );

  const documentAnalysisRows: DocumentAnalysisRow[] = [];
  const documentFailures: DocumentAnalysisRow[] = [];

  for (const doc of supportedDocs) {
    const docType = String(doc.doc_type || "").trim();

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "document_analysis_started",
        event_data: {
          document_id: doc.id,
          charger_id: doc.charger_id || null,
          doc_type: docType,
          analysis_kind: docType === "factuur" ? "factuur_extract_v1" : "foto_extract_v1",
          method_code: ANALYSIS_METHOD_CODE,
          method_version: ANALYSIS_METHOD_VERSION,
          status: "queued",
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );

    try {
      const row = buildDocumentAnalysisRow(dossier, doc);
      documentAnalysisRows.push(row);

      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "document_analysis_completed",
          event_data: {
            document_id: doc.id,
            charger_id: doc.charger_id || null,
            doc_type: docType,
            analysis_kind: row.analysis_kind,
            method_code: row.method_code,
            method_version: row.method_version,
            status: row.status,
          },
        },
        meta,
        { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
      );
    } catch (e: any) {
      const ts = new Date().toISOString();
      const failedRow: DocumentAnalysisRow = {
        dossier_id,
        document_id: doc.id,
        charger_id: doc.charger_id ? String(doc.charger_id) : null,
        doc_type: docType,
        analysis_kind: docType === "factuur" ? "factuur_extract_v1" : "foto_extract_v1",
        status: "failed",
        method_code: ANALYSIS_METHOD_CODE,
        method_version: ANALYSIS_METHOD_VERSION,
        observed_fields: {},
        confidence: {},
        limitations: [
          "document_analysis_exception",
        ],
        summary: {
          error: String(e?.message || e),
        },
        created_at: ts,
        updated_at: ts,
      };

      documentFailures.push(failedRow);

      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "document_analysis_failed",
          event_data: {
            document_id: doc.id,
            charger_id: doc.charger_id || null,
            doc_type: docType,
            analysis_kind: failedRow.analysis_kind,
            method_code: failedRow.method_code,
            method_version: failedRow.method_version,
            status: failedRow.status,
            message: String(e?.message || e),
          },
        },
        meta,
        { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
      );
    }
  }

  const allDocumentRows = [...documentAnalysisRows, ...documentFailures];

  if (allDocumentRows.length > 0) {
    const { error: insDocErr } = await SB
      .from("dossier_analysis_document")
      .insert(allDocumentRows);

    if (insDocErr) {
      return reject("analysis_document_insert", 500, insDocErr.message, {
        reason: "db_error",
      });
    }
  }

  const docsByCharger = groupConfirmedDocsByCharger(supportedDocs);
  const chargerAnalysisRows: ChargerAnalysisRow[] = [];

  for (const charger of chargerRows) {
    const docsForCharger = docsByCharger[String(charger.id)] || [];
    const rows = buildChargerAnalysisRows(dossier, charger, docsForCharger);
    chargerAnalysisRows.push(...rows);
  }

  if (chargerAnalysisRows.length > 0) {
    const { error: insChErr } = await SB
      .from("dossier_analysis_charger")
      .insert(chargerAnalysisRows);

    if (insChErr) {
      return reject("analysis_charger_insert", 500, insChErr.message, {
        reason: "db_error",
      });
    }

    for (const row of chargerAnalysisRows) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "charger_analysis_result_written",
          event_data: {
            charger_id: row.charger_id,
            document_id: row.source_document_id,
            analysis_code: row.analysis_code,
            method_code: row.method_code,
            method_version: row.method_version,
            status: row.status,
          },
        },
        meta,
        { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
      );
    }
  }

  const summaryRow: SummaryInsertRow = buildSummaryAnalysisRow(
    dossier,
    allDocumentRows,
    chargerAnalysisRows,
  );

  const { error: insSumErr } = await SB
    .from("dossier_analysis_summary")
    .insert(summaryRow);

  if (insSumErr) {
    return reject("analysis_summary_insert", 500, insSumErr.message, {
      reason: "db_error",
    });
  }

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "dossier_analysis_summary_generated",
      event_data: {
        method_code: summaryRow.method_code,
        method_version: summaryRow.method_version,
        overall_status: summaryRow.overall_status,
        document_analysis_count: allDocumentRows.length,
        charger_analysis_count: chargerAnalysisRows.length,
      },
    },
    meta,
    { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
  );

  const body = {
    ok: true,
    dossier_id,
    mode,
    analysis_status: summaryRow.overall_status,
    analysis_run: {
      documents_seen: confirmedDocs.length,
      supported_documents_seen: supportedDocs.length,
      document_analyses_completed: documentAnalysisRows.filter((r) => r.status === "completed").length,
      document_analyses_failed: documentFailures.length,
      charger_results_written: chargerAnalysisRows.length,
      summary_written: true,
    },
  };

  return finalize(200, body);
});