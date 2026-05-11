// supabase/functions/retention-worker/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getReqMeta } from "../_shared/reqmeta.ts";
import { insertAuditFailOpen } from "../_shared/audit.ts";

// ======================================================
// RETENTION CONFIG — change here first
// ======================================================
//
// These values are intentionally centralized at the top of this worker.
// If retention policy changes later, change it here first and make sure
// the same values are passed into the DB cleanup helpers.
//
// Current MVP policy:
// - preserved/exported runtime cleanup grace: 3 days
// - abandoned draft cleanup: 7 days
// - locked/in_review unpaid cleanup: 14 days
// - locked/unpaid reminders: day 3, 7, 10 (not implemented in this worker yet)

const RETENTION_CONFIG = {
  preservedRuntimeCleanupGraceDays: 3,
  draftRetentionDays: 7,
  lockedUnpaidRetentionDays: 14,
  lockedUnpaidReminderDays: [3, 7, 10],

  batchLimit: 10,
  storageDeleteBatchSize: 1000,

  workerSecretHeader: "x-retention-worker-secret",
  actorRef: "system:retention-worker",
};

// ======================================================
// Helpers
// ======================================================

type RetentionRow = {
  dossier_id: string;
  retention_class: string;
  apply: boolean;
  preserved: boolean;
  cutoff_at: string | null;
  dossier_status: string | null;
  locked_at: string | null;
  updated_at: string | null;
  export_id: string | null;
  export_created_at: string | null;
  runtime_documents: number;
  runtime_chargers: number;
  runtime_audit_events: number;
  runtime_sessions: number;
  runtime_analysis_runs: number;
  runtime_observed_sources: number;
  runtime_storage_paths: Array<{ bucket: string; path: string }>;
  preserved_storage_paths: Array<{ bucket: string; path: string }>;
  deletable_storage_paths: Array<{ bucket: string; path: string }>;
  deleted_runtime_dossier: boolean;
};

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const txt = await req.text().catch(() => "");
  if (!txt.trim()) return {};

  try {
    const parsed = JSON.parse(txt);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch (_e) {
    return {};
  }
}

function asBool(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  return fallback;
}

function asInt(v: unknown, fallback: number, min: number, max: number) {
  const n = Number(v ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function asStringOrNull(v: unknown) {
  const s = String(v ?? "").trim();
  return s || null;
}

function uniqStoragePaths(items: unknown): Array<{ bucket: string; path: string }> {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  const out: Array<{ bucket: string; path: string }> = [];

  for (const item of items) {
    const bucket = String((item as any)?.bucket || "").trim();
    const path = String((item as any)?.path || "").trim();
    if (!bucket || !path) continue;

    const key = `${bucket}\n${path}`;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push({ bucket, path });
  }

  out.sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`));
  return out;
}

function intersectStoragePaths(
  a: Array<{ bucket: string; path: string }>,
  b: Array<{ bucket: string; path: string }>,
) {
  const protectedSet = new Set(b.map((x) => `${x.bucket}\n${x.path}`));
  return a.filter((x) => protectedSet.has(`${x.bucket}\n${x.path}`));
}

function groupByBucket(items: Array<{ bucket: string; path: string }>) {
  const grouped = new Map<string, string[]>();

  for (const item of items) {
    if (!grouped.has(item.bucket)) grouped.set(item.bucket, []);
    grouped.get(item.bucket)!.push(item.path);
  }

  return grouped;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function rpcParams(base: Record<string, unknown>) {
  return {
    ...base,
    p_preserved_grace_days: RETENTION_CONFIG.preservedRuntimeCleanupGraceDays,
    p_draft_retention_days: RETENTION_CONFIG.draftRetentionDays,
    p_locked_unpaid_retention_days: RETENTION_CONFIG.lockedUnpaidRetentionDays,
  };
}

async function auditFailOpen(
  supabase: ReturnType<typeof createClient>,
  dossierId: string,
  eventType: string,
  eventData: Record<string, unknown>,
  meta: ReturnType<typeof getReqMeta>,
) {
  await insertAuditFailOpen(
    supabase,
    {
      dossier_id: dossierId,
      actor_type: "system",
      event_type: eventType,
      event_data: {
        actor_ref: RETENTION_CONFIG.actorRef,
        ...eventData,
      },
    },
    meta,
  );
}

async function runWorker(req: Request) {
  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const RETENTION_WORKER_SECRET = getEnv("RETENTION_WORKER_SECRET");

  const incomingSecret = req.headers.get(RETENTION_CONFIG.workerSecretHeader);
  if (incomingSecret !== RETENTION_WORKER_SECRET) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const meta = getReqMeta(req);
  const body = await readJsonBody(req);

  const apply = asBool(body.apply, false);
  const nowOverride = asStringOrNull(body.now);
  const targetDossierId = asStringOrNull(body.target_dossier_id);
  const limit = asInt(body.limit, RETENTION_CONFIG.batchLimit, 1, 50);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const dryParams = rpcParams({
    p_apply: false,
    p_now: nowOverride || new Date().toISOString(),
    p_target_dossier_id: targetDossierId,
    p_limit: limit,
  });

  const { data: candidatesRaw, error: dryErr } = await supabase.rpc(
    "enval_retention_cleanup",
    dryParams,
  );

  if (dryErr) {
    return jsonResponse({
      ok: false,
      error: "retention_dry_run_failed",
      message: dryErr.message,
      details: dryErr,
    }, 500);
  }

  const candidates = (Array.isArray(candidatesRaw) ? candidatesRaw : []) as RetentionRow[];

  if (!apply) {
    return jsonResponse({
      ok: true,
      apply: false,
      config: RETENTION_CONFIG,
      candidate_count: candidates.length,
      candidates: candidates.map((row) => ({
        dossier_id: row.dossier_id,
        retention_class: row.retention_class,
        preserved: row.preserved,
        cutoff_at: row.cutoff_at,
        runtime_documents: row.runtime_documents,
        runtime_chargers: row.runtime_chargers,
        runtime_audit_events: row.runtime_audit_events,
        runtime_sessions: row.runtime_sessions,
        runtime_analysis_runs: row.runtime_analysis_runs,
        runtime_observed_sources: row.runtime_observed_sources,
        runtime_storage_path_count: uniqStoragePaths(row.runtime_storage_paths).length,
        preserved_storage_path_count: uniqStoragePaths(row.preserved_storage_paths).length,
        deletable_storage_path_count: uniqStoragePaths(row.deletable_storage_paths).length,
      })),
    });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const row of candidates) {
    const dossierId = row.dossier_id;
    const runtimeStoragePaths = uniqStoragePaths(row.runtime_storage_paths);
    const preservedStoragePaths = uniqStoragePaths(row.preserved_storage_paths);
    const deletableStoragePaths = uniqStoragePaths(row.deletable_storage_paths);
    const protectedOverlap = intersectStoragePaths(deletableStoragePaths, preservedStoragePaths);

    const result: Record<string, unknown> = {
      dossier_id: dossierId,
      retention_class: row.retention_class,
      preserved: row.preserved,
      runtime_storage_path_count: runtimeStoragePaths.length,
      preserved_storage_path_count: preservedStoragePaths.length,
      deletable_storage_path_count: deletableStoragePaths.length,
      storage_deleted: 0,
      db_cleanup_applied: false,
    };

    try {
      if (protectedOverlap.length > 0) {
        throw new Error("RETENTION_STORAGE_GUARD_FAILED: deletable paths overlap preserved paths");
      }

      const grouped = groupByBucket(deletableStoragePaths);

      for (const [bucket, paths] of grouped.entries()) {
        for (const part of chunk(paths, RETENTION_CONFIG.storageDeleteBatchSize)) {
          const { error: storageErr } = await supabase.storage.from(bucket).remove(part);
          if (storageErr) {
            throw new Error(`STORAGE_DELETE_FAILED: bucket=${bucket} message=${storageErr.message}`);
          }

          result.storage_deleted = Number(result.storage_deleted || 0) + part.length;
        }
      }

      const { data: applyRowsRaw, error: applyErr } = await supabase.rpc(
        "enval_retention_cleanup_apply_after_storage",
        rpcParams({
          p_target_dossier_id: dossierId,
          p_now: nowOverride || new Date().toISOString(),
          p_confirmed_deleted_storage_paths: deletableStoragePaths,
        }),
      );

      if (applyErr) {
        throw new Error(`DB_CLEANUP_FAILED: ${applyErr.message}`);
      }

      const applyRows = Array.isArray(applyRowsRaw) ? applyRowsRaw : [];
      const applied = applyRows[0] as RetentionRow | undefined;

      if (!applied?.deleted_runtime_dossier) {
        throw new Error("DB_CLEANUP_FAILED: deleted_runtime_dossier not true");
      }

      result.db_cleanup_applied = true;
      result.deleted_runtime_dossier = true;
      result.export_id = applied.export_id || null;

      // Note:
      // For runtime-deleted dossiers this dossier_audit_events row may be removed by cascade.
      // Permanent cleanup audit events require a separate system cleanup event table later.
      await auditFailOpen(supabase, dossierId, "dossier_runtime_cleanup_applied", {
        retention_class: row.retention_class,
        preserved: row.preserved,
        storage_deleted: result.storage_deleted,
        runtime_storage_path_count: runtimeStoragePaths.length,
        preserved_storage_path_count: preservedStoragePaths.length,
        deletable_storage_path_count: deletableStoragePaths.length,
        export_id: applied.export_id || null,
      }, meta);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      result.error = msg;

      await auditFailOpen(supabase, dossierId, "dossier_runtime_cleanup_failed", {
        retention_class: row.retention_class,
        preserved: row.preserved,
        stage: "retention_worker_apply",
        message: msg,
        runtime_storage_path_count: runtimeStoragePaths.length,
        preserved_storage_path_count: preservedStoragePaths.length,
        deletable_storage_path_count: deletableStoragePaths.length,
      }, meta);
    }

    results.push(result);
  }

  const failed = results.filter((r) => r.error);
  return jsonResponse({
    ok: failed.length === 0,
    apply: true,
    config: RETENTION_CONFIG,
    candidate_count: candidates.length,
    processed_count: results.length,
    failed_count: failed.length,
    results,
  }, failed.length === 0 ? 200 : 500);
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    return await runWorker(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("retention-worker fatal:", err);
    return jsonResponse({ ok: false, error: "Internal error", message: msg }, 500);
  }
});
