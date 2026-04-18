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
  buildPhotoAnalysisRows,
  buildDocumentAnalysisRow,
  buildSummaryAnalysisRow,
  groupConfirmedDocsByCharger,
  isAnalysisAllowedForPrecheck,
  isSupportedDocType,
  sanitizeMode,
  buildInvoiceRowsFromObserved,
  type InvoiceObservedFields,
  type ChargerAnalysisRow,
  type ChargerRow,
  type DocumentAnalysisRow,
  type DocumentRow,
  type DossierRow,
  type SummaryAnalysisRow,
} from "../_shared/analysis.ts";

import {
  createAnalysisRun,
  markAnalysisRunRunning,
  markAnalysisRunCompleted,
  markAnalysisRunFailed,
  recoverStaleActiveAnalysisRuns,
  getActiveAnalysisRun,
} from "../_shared/analysis_runs.ts";

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

function buildInvoicePreAnalysisObservedFields(): InvoiceObservedFields {
  return {
    customer_name: null,
    address_line: null,
    house_number: null,
    postcode_line: null,
    city_line: null,
    country_line: null,
    brand: null,
    model: null,
    serial_number: null,
    serial_candidate_raw: null,
    mid_number: null,
    mid_candidate_raw: null,
  };
}

function buildInvoicePreAnalysisConfidence(args: {
  source_kind: "pdf" | "image";
  extracted_text_length?: number;
  extraction_method?: string | null;
  extraction_stage?: string | null;
}) {
  return {
    source_kind: args.source_kind,
    extraction_method: args.extraction_method ?? null,
    extraction_stage: args.extraction_stage ?? null,
    extracted_text_length: args.extracted_text_length ?? 0,
    analysis_mode: "pre_analysis_placeholder_only",
  };
}

type ClientObservedInvoicePayload = {
  document_id: string;
  parser_kind: string | null;
  parser_version: string | null;
  source_kind: string | null;
  observed_fields: InvoiceObservedFields;
  confidence: Record<string, unknown>;
  limitations: string[];
  summary: Record<string, unknown>;
  field_sources: Record<string, unknown> | null;
  pages: unknown[] | null;
};

type ClientVerifyPayloadNormalized = {
  version: string | null;
  invoice_observed_by_document_id: Record<string, ClientObservedInvoicePayload>;
};

type PersistedObservedSourceRow = {
  document_id: string;
  source_kind?: string | null;
  producer_kind?: string | null;
  producer_version?: string | null;
  status?: string | null;
  observed_fields?: unknown;
  confidence?: unknown;
  limitations?: unknown;
  summary?: unknown;
  field_sources?: unknown;
  pages?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringOrNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeInvoiceObservedFields(raw: unknown): InvoiceObservedFields {
  const obj = asRecord(raw);

  return {
    customer_name: asStringOrNull(obj.customer_name),
    address_line: asStringOrNull(obj.address_line),
    house_number: asStringOrNull(obj.house_number),
    postcode_line: asStringOrNull(obj.postcode_line),
    city_line: asStringOrNull(obj.city_line),
    country_line: asStringOrNull(obj.country_line),
    brand: asStringOrNull(obj.brand),
    model: asStringOrNull(obj.model),
    serial_number: asStringOrNull(obj.serial_number),
    serial_candidate_raw: asStringOrNull(obj.serial_candidate_raw),
    mid_number: asStringOrNull(obj.mid_number),
    mid_candidate_raw: asStringOrNull(obj.mid_candidate_raw),
  };
}

function parseClientVerifyPayload(input: unknown): ClientVerifyPayloadNormalized {
  const root = asRecord(input);
  const version = asStringOrNull(root.version);

  const documentSnapshot = asRecord(root.document_snapshot);
  const clientObserved = Array.isArray(documentSnapshot.client_invoice_observed)
    ? documentSnapshot.client_invoice_observed
    : [];

  const invoice_observed_by_document_id: Record<string, ClientObservedInvoicePayload> = {};

  for (const itemRaw of clientObserved) {
    const item = asRecord(itemRaw);
    const document_id = asStringOrNull(item.document_id);
    if (!document_id) continue;

    const parserPayload = asRecord(item.parser_payload);

    invoice_observed_by_document_id[document_id] = {
      document_id,
      parser_kind: asStringOrNull(parserPayload.parser_kind),
      parser_version: asStringOrNull(parserPayload.parser_version),
      source_kind: asStringOrNull(parserPayload.source_kind),
      observed_fields: normalizeInvoiceObservedFields(parserPayload.observed_fields),
      confidence: asRecord(parserPayload.confidence),
      limitations: asStringArray(parserPayload.limitations),
      summary: asRecord(parserPayload.summary),
      field_sources: (() => {
        const v = parserPayload.field_sources;
        return v && typeof v === "object" && !Array.isArray(v)
          ? v as Record<string, unknown>
          : null;
      })(),
      pages: Array.isArray(parserPayload.pages) ? parserPayload.pages : null,
    };
  }

  return {
    version,
    invoice_observed_by_document_id,
  };
}

function normalizePersistedObservedSourceRow(
  row: PersistedObservedSourceRow,
): ClientObservedInvoicePayload | null {
  const confidence = asRecord(row.confidence);
  const limitations = asStringArray(row.limitations);
  const observed_fields = normalizeInvoiceObservedFields(row.observed_fields);

  const observedNonNullFields = Number(confidence.observed_non_null_fields || 0);

  const hasAnyObservedField = Object.values(observed_fields).some((v) => {
    const s = String(v ?? "").trim();
    return !!s;
  });

  const looksEmptyPdfResult =
    String(row.source_kind || "").trim().toLowerCase() === "pdf" &&
    (
      observedNonNullFields <= 0 ||
      limitations.includes("pdf_text_extraction_empty") ||
      !hasAnyObservedField
    );

  if (looksEmptyPdfResult) {
    return null;
  }

  return {
    document_id: String(row.document_id),
    parser_kind: asStringOrNull(row.producer_kind),
    parser_version: asStringOrNull(row.producer_version),
    source_kind: asStringOrNull(row.source_kind),
    observed_fields,
    confidence,
    limitations,
    summary: asRecord(row.summary),
    field_sources: (() => {
      const v = row.field_sources;
      return v && typeof v === "object" && !Array.isArray(v)
        ? v as Record<string, unknown>
        : null;
    })(),
    pages: Array.isArray(row.pages) ? row.pages : null,
  };
}

function buildAnalysisReadablePayload(args: {
  run_id: string;
  overall_status: string;
  summary: Record<string, unknown>;
  limitations: unknown[];
  documents: Array<Record<string, unknown>>;
  charger_results: Array<Record<string, unknown>>;
  source_docs: Array<Record<string, unknown>>;
  source_chargers: Array<Record<string, unknown>>;
}) {
  const docById: Record<string, Record<string, unknown>> = {};
  for (const d of args.source_docs || []) {
    const id = String(d.id || "");
    if (id) docById[id] = d;
  }

  const chargerById: Record<string, Record<string, unknown>> = {};
  for (const ch of args.source_chargers || []) {
    const id = String(ch.id || "");
    if (id) chargerById[id] = ch;
  }

  const documents = (args.documents || []).map((d) => ({
    document_id: d.document_id || null,
    filename: docById[String(d.document_id || "")]?.filename || null,
    charger_id: d.charger_id || null,
    doc_type: d.doc_type || null,
    analysis_kind: d.analysis_kind || null,
    status: d.status || null,
    method_code: d.method_code || null,
    method_version: d.method_version || null,
    observed_fields: d.observed_fields || {},
    confidence: d.confidence || {},
    limitations: d.limitations || [],
    summary: d.summary || {},
    created_at: d.created_at || null,
    updated_at: d.updated_at || null,
  }));

  const chargerGroups: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of args.charger_results || []) {
    const chargerId = String(row.charger_id || "");
    if (!chargerId) continue;
    if (!chargerGroups[chargerId]) chargerGroups[chargerId] = [];
    chargerGroups[chargerId].push(row);
  }

  const chargers = Object.entries(chargerGroups).map(([chargerId, rows]) => {
    const ch = chargerById[chargerId] || {};

    return {
      charger_id: chargerId,
      charger_label: {
        brand: ch.brand || null,
        model: ch.model || null,
        serial_number: ch.serial_number || null,
        mid_number: ch.mid_number || null,
      },
      analysis_results: rows.map((r) => {
        const srcId = String(r.source_document_id || "");
        const srcDoc = srcId ? docById[srcId] || {} : {};

        return {
          analysis_code: r.analysis_code || null,
          status: r.status || null,
          source_document_id: r.source_document_id || null,
          source_document_filename: srcDoc.filename || null,
          source_document_doc_type: srcDoc.doc_type || null,
          reason: r.evaluation_details?.reason || null,
          declared_value: r.declared_value || {},
          observed_value: r.observed_value || {},
          evaluation_details: r.evaluation_details || {},
          method_code: r.method_code || null,
          method_version: r.method_version || null,
          created_at: r.created_at || null,
          updated_at: r.updated_at || null,
        };
      }),
    };
  });

  return {
    version: "enval-analysis-readable.v1",
    run_id: args.run_id,
    overall_status: args.overall_status,
    summary: args.summary || {},
    limitations: args.limitations || [],
    documents,
    chargers,
  };
}

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

  const clientVerifyPayload = parseClientVerifyPayload(parsed?.client_verify_payload);

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

  if (!isAnalysisAllowedForPrecheck(dossier.status, dossier.locked_at)) {
    return reject(
      "analysis_gate",
      409,
      "Analyse is niet toegestaan voor deze dossierstatus.",
      {
        reason: "status_not_allowed",
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

  let analysisRunId: string | null = null;

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

  try {
    const supportedDocs = confirmedDocs.filter((d) =>
      isSupportedDocType(String(d.doc_type || "").trim())
    );

    const invoiceDocIds = supportedDocs
      .filter((d) => String(d.doc_type || "").trim() === "factuur")
      .map((d) => String(d.id));

    let persistedInvoiceObservedByDocumentId: Record<string, ClientObservedInvoicePayload> = {};

    if (invoiceDocIds.length > 0) {
      const { data: persistedRows, error: persistedErr } = await SB
        .from("dossier_document_observed_sources")
        .select("document_id,source_kind,producer_kind,producer_version,status,observed_fields,confidence,limitations,summary,field_sources,pages")
        .eq("dossier_id", dossier_id)
        .in("document_id", invoiceDocIds);

      if (persistedErr) {
        throw new Error(`observed_source_read: ${persistedErr.message}`);
      }

      persistedInvoiceObservedByDocumentId = Object.fromEntries(
        ((persistedRows || []) as PersistedObservedSourceRow[])
          .map((row) => {
            const normalized = normalizePersistedObservedSourceRow(row);
            if (!normalized) return null;
            return [String(row.document_id), normalized] as const;
          })
          .filter(Boolean) as Array<readonly [string, ClientObservedInvoicePayload]>,
      );
    }

    const staleRecovery = await recoverStaleActiveAnalysisRuns(SB, dossier_id);

    if (staleRecovery.recovered_count > 0) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "analysis_run_recovered_stale",
          event_data: {
            recovered_count: staleRecovery.recovered_count,
            recovered_ids: staleRecovery.recovered_ids,
            reason: "stale_active_run_recovered_before_new_run",
          },
        },
        meta,
        { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
      );
    }

    const analysisRun = await createAnalysisRun(SB, {
      dossier_id,
      trigger_type: "manual_rerun",
      requested_by_actor_type: "customer",
      requested_by_actor_ref: auth.actor_ref,
      request_source: "api-dossier-verify",
      mode,
      method_code: ANALYSIS_METHOD_CODE,
      method_version: ANALYSIS_METHOD_VERSION,
      worker_runtime: "supabase_edge_function",
      worker_version: ANALYSIS_METHOD_VERSION,
      trigger_reason: "customer_verify_refresh",
      document_count: confirmedDocs.length,
      supported_document_count: supportedDocs.length,
    });

    analysisRunId = analysisRun.id;

    await markAnalysisRunRunning(SB, analysisRunId, {
      document_count: confirmedDocs.length,
      supported_document_count: supportedDocs.length,
      worker_runtime: "supabase_edge_function",
      worker_version: ANALYSIS_METHOD_VERSION,
    });

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "analysis_run_started",
        event_data: {
          run_id: analysisRunId,
          trigger_type: "manual_rerun",
          request_source: "api-dossier-verify",
          mode,
          method_code: ANALYSIS_METHOD_CODE,
          method_version: ANALYSIS_METHOD_VERSION,
          document_count: confirmedDocs.length,
          supported_document_count: supportedDocs.length,
          client_invoice_observed_count: Object.keys(clientVerifyPayload.invoice_observed_by_document_id).length,
          persisted_invoice_observed_count: Object.keys(persistedInvoiceObservedByDocumentId).length,
          client_verify_payload_version: clientVerifyPayload.version,
          status: "running",
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );

    const documentAnalysisRows: DocumentAnalysisRow[] = [];
    const documentFailures: DocumentAnalysisRow[] = [];

    const invoiceObservedByDocumentId: Record<string, InvoiceObservedFields | null> = {};

    for (const doc of supportedDocs) {
      const docType = String(doc.doc_type || "").trim();
      const contentType = String(doc.content_type || "").trim().toLowerCase();

      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "document_analysis_started",
          event_data: {
            run_id: analysisRunId,
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
        let row: DocumentAnalysisRow;

        const clientPayload = docType === "factuur"
          ? (clientVerifyPayload.invoice_observed_by_document_id[doc.id] ?? null)
          : null;

        const persistedPayload = docType === "factuur"
          ? (persistedInvoiceObservedByDocumentId[doc.id] ?? null)
          : null;

        if (docType === "factuur" && clientPayload) {
          const payload = clientPayload;
          const observed = payload.observed_fields;

          invoiceObservedByDocumentId[doc.id] = observed;

          row = buildDocumentAnalysisRow(dossier, doc, analysisRunId!, {
            invoice_observed_fields: observed,
            confidence: {
              ...payload.confidence,
              parser_kind: payload.parser_kind,
              parser_version: payload.parser_version,
              source_kind: payload.source_kind,
              client_verify_payload_version: clientVerifyPayload.version,
              analysis_mode: "client_parser_payload",
            },
            limitations: payload.limitations,
            summary_extra: {
              ...payload.summary,
              parser_kind: payload.parser_kind,
              parser_version: payload.parser_version,
              source_kind: payload.source_kind,
              field_sources: payload.field_sources,
              pages: payload.pages,
              extraction_source: "client_parser_payload",
              content_analysis_mode: "client_parser_observed_fields",
            },
          });

        } else if (docType === "factuur" && persistedPayload) {
          const payload = persistedPayload;
          const observed = payload.observed_fields;

          invoiceObservedByDocumentId[doc.id] = observed;

          row = buildDocumentAnalysisRow(dossier, doc, analysisRunId!, {
            invoice_observed_fields: observed,
            confidence: {
              ...payload.confidence,
              parser_kind: payload.parser_kind,
              parser_version: payload.parser_version,
              source_kind: payload.source_kind,
              persisted_observed_source: true,
              analysis_mode: "persisted_observed_source",
            },
            limitations: payload.limitations,
            summary_extra: {
              ...payload.summary,
              parser_kind: payload.parser_kind,
              parser_version: payload.parser_version,
              source_kind: payload.source_kind,
              field_sources: payload.field_sources,
              pages: payload.pages,
              extraction_source: "persisted_observed_source",
              content_analysis_mode: "persisted_observed_fields",
            },
          });

        } else if (
          docType === "factuur" &&
          contentType === "application/pdf"
        ) {
          const observed = buildInvoicePreAnalysisObservedFields();
          invoiceObservedByDocumentId[doc.id] = observed;

          row = buildDocumentAnalysisRow(dossier, doc, analysisRunId!, {
            invoice_observed_fields: observed,
            confidence: buildInvoicePreAnalysisConfidence({
              source_kind: "pdf",
            }),
            limitations: [
              "invoice_pdf_inline_extraction_removed_from_verify",
              "invoice_worker_result_not_connected_yet",
              "invoice_client_parser_payload_missing",
            ],
            summary_extra: {
              mode: "invoice_extract_skipped",
              reason: "inline_pdf_extraction_removed_from_verify",
              extraction_source: "worker_pending",
              content_type: contentType || null,
              content_analysis_mode: "pre_analysis_placeholder_only",
            },
          });

        } else if (
          docType === "factuur" &&
          (contentType === "image/jpeg" || contentType === "image/png")
        ) {
          const observed = buildInvoicePreAnalysisObservedFields();
          invoiceObservedByDocumentId[doc.id] = observed;

          row = buildDocumentAnalysisRow(dossier, doc, analysisRunId!, {
            invoice_observed_fields: observed,
            confidence: buildInvoicePreAnalysisConfidence({
              source_kind: "image",
            }),
            limitations: [
              "invoice_image_inline_extraction_removed_from_verify",
              "invoice_worker_result_not_connected_yet",
              "invoice_client_parser_payload_missing",
            ],
            summary_extra: {
              mode: "invoice_extract_skipped",
              reason: "inline_image_extraction_removed_from_verify",
              extraction_source: "worker_pending",
              content_type: contentType || null,
              content_analysis_mode: "pre_analysis_placeholder_only",
            },
          });

        } else if (docType === "factuur") {
          const observed = buildInvoicePreAnalysisObservedFields();
          invoiceObservedByDocumentId[doc.id] = observed;

          row = buildDocumentAnalysisRow(dossier, doc, analysisRunId!, {
            invoice_observed_fields: observed,
            confidence: buildInvoicePreAnalysisConfidence({
              source_kind: "pdf",
            }),
            limitations: [
              "invoice_content_type_not_supported_for_analysis",
              "invoice_worker_result_not_connected_yet",
              "invoice_client_parser_payload_missing",
            ],
            summary_extra: {
              mode: "invoice_extract_skipped",
              reason: "unsupported_invoice_content_type",
              extraction_source: "worker_pending",
              content_type: contentType || null,
              content_analysis_mode: "pre_analysis_placeholder_only",
            },
          });

        } else {
          row = buildDocumentAnalysisRow(dossier, doc, analysisRunId!, {
            limitations: [
              "photo_extraction_not_implemented_yet",
            ],
            summary_extra: {
              mode: "photo_extract_skipped",
              reason: "photo_analysis_not_implemented_yet",
            },
          });
        }


        documentAnalysisRows.push(row);

        await insertAuditFailOpen(
          SB,
          {
            dossier_id,
            actor_type: "customer",
            event_type: "document_analysis_completed",
            event_data: {
              run_id: analysisRunId,
              document_id: doc.id,
              charger_id: doc.charger_id || null,
              doc_type: docType,
              analysis_kind: row.analysis_kind,
              method_code: row.method_code,
              method_version: row.method_version,
              status: row.status,
              used_client_parser_payload:
                docType === "factuur" &&
                !!clientVerifyPayload.invoice_observed_by_document_id[doc.id],
              used_persisted_observed_source:
                docType === "factuur" &&
                !clientVerifyPayload.invoice_observed_by_document_id[doc.id] &&
                !!persistedInvoiceObservedByDocumentId[doc.id],
            },
          },
          meta,
          { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
        );
      } catch (e: any) {
        const ts = new Date().toISOString();
        const failedRow: DocumentAnalysisRow = {
          dossier_id,
          run_id: analysisRunId!,
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

        if (docType === "factuur") {
          invoiceObservedByDocumentId[doc.id] = null;
        }

        documentFailures.push(failedRow);

        await insertAuditFailOpen(
          SB,
          {
            dossier_id,
            actor_type: "customer",
            event_type: "document_analysis_failed",
            event_data: {
              run_id: analysisRunId,
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
        throw new Error(`analysis_document_insert: ${insDocErr.message}`);
      }
    }

    const docsByCharger = groupConfirmedDocsByCharger(supportedDocs);
    const chargerAnalysisRows: ChargerAnalysisRow[] = [];

    for (const charger of chargerRows) {
      const docsForCharger = docsByCharger[String(charger.id)] || [];

      const invoiceDoc =
        docsForCharger.find((d) => String(d.doc_type || "").trim() === "factuur") ?? null;

      const photoRows = buildPhotoAnalysisRows(
        dossier,
        charger,
        analysisRunId!,
        docsForCharger.filter((d) => String(d.doc_type || "").trim() === "foto_laadpunt"),
      );

      const invoiceObserved =
        invoiceDoc ? (invoiceObservedByDocumentId[invoiceDoc.id] ?? null) : null;

      const invoiceRows = buildInvoiceRowsFromObserved(
        dossier,
        charger,
        analysisRunId!,
        invoiceDoc,
        invoiceObserved,
      );

      chargerAnalysisRows.push(...invoiceRows, ...photoRows);
    }

    if (chargerAnalysisRows.length > 0) {
      const { error: insChErr } = await SB
        .from("dossier_analysis_charger")
        .insert(chargerAnalysisRows);

      if (insChErr) {
        throw new Error(`analysis_charger_insert: ${insChErr.message}`);
      }

      for (const row of chargerAnalysisRows) {
        await insertAuditFailOpen(
          SB,
          {
            dossier_id,
            actor_type: "customer",
            event_type: "charger_analysis_result_written",
            event_data: {
              run_id: analysisRunId,
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

    const summaryRow: SummaryAnalysisRow = buildSummaryAnalysisRow(
      dossier,
      analysisRunId!,
      allDocumentRows,
      chargerAnalysisRows,
    );

    const { error: insSumErr } = await SB
      .from("dossier_analysis_summary")
      .insert(summaryRow);

    if (insSumErr) {
      throw new Error(`analysis_summary_insert: ${insSumErr.message}`);
    }

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_analysis_summary_generated",
        event_data: {
          run_id: analysisRunId,
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

    await markAnalysisRunCompleted(SB, analysisRunId!, {
      document_count: confirmedDocs.length,
      supported_document_count: supportedDocs.length,
    });

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "analysis_run_completed",
        event_data: {
          run_id: analysisRunId,
          trigger_type: "manual_rerun",
          request_source: "api-dossier-verify",
          mode,
          method_code: ANALYSIS_METHOD_CODE,
          method_version: ANALYSIS_METHOD_VERSION,
          overall_status: summaryRow.overall_status,
          document_analysis_count: allDocumentRows.length,
          charger_analysis_count: chargerAnalysisRows.length,
          status: "completed",
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );

    const analysis_readable = buildAnalysisReadablePayload({
      run_id: analysisRunId!,
      overall_status: summaryRow.overall_status,
      summary: summaryRow.summary,
      limitations: summaryRow.limitations,
      documents: allDocumentRows as Array<Record<string, unknown>>,
      charger_results: chargerAnalysisRows as Array<Record<string, unknown>>,
      source_docs: supportedDocs as Array<Record<string, unknown>>,
      source_chargers: chargerRows as Array<Record<string, unknown>>,
    });

    const body = {
      ok: true,
      dossier_id,
      run_id: analysisRunId,
      mode,
      analysis_status: summaryRow.overall_status,
      analysis_run: {
        documents_seen: confirmedDocs.length,
        supported_documents_seen: supportedDocs.length,
        client_invoice_observed_count: Object.keys(clientVerifyPayload.invoice_observed_by_document_id).length,
        persisted_invoice_observed_count: Object.keys(persistedInvoiceObservedByDocumentId).length,
        document_analyses_completed: documentAnalysisRows.filter((r) => r.status === "completed").length,
        document_analyses_failed: documentFailures.length,
        charger_results_written: chargerAnalysisRows.length,
        summary_written: true,
      },
      analysis_readable,
    };

    return finalize(200, body);

  } catch (e: any) {
    if (analysisRunId) {
      try {
        await markAnalysisRunFailed(SB, analysisRunId, {
          error_code: "analysis_execution_failed",
          error_message: String(e?.message || e),
          document_count: confirmedDocs.length,
          supported_document_count: supportedDocs.length,
        });

        await insertAuditFailOpen(
          SB,
          {
            dossier_id,
            actor_type: "customer",
            event_type: "analysis_run_failed",
            event_data: {
              run_id: analysisRunId,
              trigger_type: "manual_rerun",
              request_source: "api-dossier-verify",
              mode,
              method_code: ANALYSIS_METHOD_CODE,
              method_version: ANALYSIS_METHOD_VERSION,
              status: "failed",
              message: String(e?.message || e),
            },
          },
          meta,
          { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
        );
      } catch (inner) {
        console.error("analysis run fail bookkeeping failed:", inner);
      }
    }

    const errMsg = String(e?.message || e);

    if (errMsg.includes("active_analysis_run_exists")) {
      let activeRunId: string | null = null;

      try {
        const activeRun = await getActiveAnalysisRun(SB, dossier_id);
        activeRunId = activeRun?.id || null;
      } catch (_) {
        activeRunId = null;
      }

      return reject(
        "analysis_execution",
        409,
        "Er draait al een actieve analyse-run voor dit dossier. Wacht even en probeer opnieuw.",
        {
          reason: "active_analysis_run_exists",
          run_id: activeRunId,
        },
      );
    }

    return reject(
      "analysis_execution",
      500,
      errMsg,
      {
        reason: "analysis_execution_failed",
        run_id: analysisRunId,
      },
    );
  }
});