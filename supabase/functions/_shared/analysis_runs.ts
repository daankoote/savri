// supabase/functions/_shared/analysis_runs.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const ANALYSIS_RUN_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type AnalysisRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AnalysisTriggerType =
  | "auto_on_lock"
  | "manual_rerun"
  | "admin_rerun"
  | "system_rerun";

export type AnalysisRequestedByActorType =
  | "customer"
  | "admin"
  | "system";

export type AnalysisMode = "refresh";

function nowIso() {
  return new Date().toISOString();
}

type SB = ReturnType<typeof createClient>;

export async function createAnalysisRun(
  SB: SB,
  args: {
    dossier_id: string;
    trigger_type: AnalysisTriggerType;
    requested_by_actor_type: AnalysisRequestedByActorType;
    requested_by_actor_ref?: string | null;
    request_source: string;
    mode?: AnalysisMode;
    method_code: string;
    method_version: string;
    worker_runtime?: string | null;
    worker_version?: string | null;
    trigger_reason?: string | null;
    document_count?: number;
    supported_document_count?: number;
  },
) {
  const ts = nowIso();

  const { data, error } = await SB
    .from("dossier_analysis_runs")
    .insert({
      dossier_id: args.dossier_id,
      trigger_type: args.trigger_type,
      requested_by_actor_type: args.requested_by_actor_type,
      requested_by_actor_ref: args.requested_by_actor_ref ?? null,
      request_source: args.request_source,
      mode: args.mode ?? "refresh",
      status: ANALYSIS_RUN_STATUS.QUEUED,
      method_code: args.method_code,
      method_version: args.method_version,
      worker_runtime: args.worker_runtime ?? null,
      worker_version: args.worker_version ?? null,
      trigger_reason: args.trigger_reason ?? null,
      document_count: args.document_count ?? 0,
      supported_document_count: args.supported_document_count ?? 0,
      created_at: ts,
      updated_at: ts,
    })
    .select("id,dossier_id,status,created_at")
    .maybeSingle();

  if (error) throw new Error(`Analysis run create failed: ${error.message}`);
  if (!data?.id) throw new Error("Analysis run create failed: no row returned");

  return data;
}

export async function markAnalysisRunRunning(
  SB: SB,
  run_id: string,
  patch?: {
    document_count?: number;
    supported_document_count?: number;
    worker_runtime?: string | null;
    worker_version?: string | null;
  },
) {
  const ts = nowIso();

  const payload: Record<string, unknown> = {
    status: ANALYSIS_RUN_STATUS.RUNNING,
    started_at: ts,
    updated_at: ts,
  };

  if (typeof patch?.document_count === "number") {
    payload.document_count = patch.document_count;
  }
  if (typeof patch?.supported_document_count === "number") {
    payload.supported_document_count = patch.supported_document_count;
  }
  if (patch?.worker_runtime !== undefined) {
    payload.worker_runtime = patch.worker_runtime;
  }
  if (patch?.worker_version !== undefined) {
    payload.worker_version = patch.worker_version;
  }

  const { error } = await SB
    .from("dossier_analysis_runs")
    .update(payload)
    .eq("id", run_id);

  if (error) throw new Error(`Analysis run start failed: ${error.message}`);
}

export async function markAnalysisRunCompleted(
  SB: SB,
  run_id: string,
  patch?: {
    document_count?: number;
    supported_document_count?: number;
  },
) {
  const ts = nowIso();

  const payload: Record<string, unknown> = {
    status: ANALYSIS_RUN_STATUS.COMPLETED,
    finished_at: ts,
    error_code: null,
    error_message: null,
    updated_at: ts,
  };

  if (typeof patch?.document_count === "number") {
    payload.document_count = patch.document_count;
  }
  if (typeof patch?.supported_document_count === "number") {
    payload.supported_document_count = patch.supported_document_count;
  }

  const { error } = await SB
    .from("dossier_analysis_runs")
    .update(payload)
    .eq("id", run_id);

  if (error) throw new Error(`Analysis run complete failed: ${error.message}`);
}

export async function markAnalysisRunFailed(
  SB: SB,
  run_id: string,
  patch?: {
    error_code?: string | null;
    error_message?: string | null;
    document_count?: number;
    supported_document_count?: number;
  },
) {
  const ts = nowIso();

  const payload: Record<string, unknown> = {
    status: ANALYSIS_RUN_STATUS.FAILED,
    finished_at: ts,
    error_code: patch?.error_code ?? "analysis_failed",
    error_message: patch?.error_message ?? "Unknown analysis failure",
    updated_at: ts,
  };

  if (typeof patch?.document_count === "number") {
    payload.document_count = patch.document_count;
  }
  if (typeof patch?.supported_document_count === "number") {
    payload.supported_document_count = patch.supported_document_count;
  }

  const { error } = await SB
    .from("dossier_analysis_runs")
    .update(payload)
    .eq("id", run_id);

  if (error) throw new Error(`Analysis run fail update failed: ${error.message}`);
}

export async function getLatestCompletedAnalysisRun(
  SB: SB,
  dossier_id: string,
) {
  const { data, error } = await SB
    .from("dossier_analysis_runs")
    .select([
      "id",
      "dossier_id",
      "trigger_type",
      "requested_by_actor_type",
      "requested_by_actor_ref",
      "request_source",
      "mode",
      "status",
      "method_code",
      "method_version",
      "worker_runtime",
      "worker_version",
      "trigger_reason",
      "document_count",
      "supported_document_count",
      "started_at",
      "finished_at",
      "error_code",
      "error_message",
      "created_at",
      "updated_at",
    ].join(","))
    .eq("dossier_id", dossier_id)
    .eq("status", ANALYSIS_RUN_STATUS.COMPLETED)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Analysis run read failed: ${error.message}`);
  return data || null;
}