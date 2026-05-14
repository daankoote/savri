// supabase/functions/locked-unpaid-reminder-worker/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getReqMeta } from "../_shared/reqmeta.ts";

// ======================================================
// LOCKED/UNPAID REMINDER CONFIG — change here first
// ======================================================
//
// Purpose:
// - Queue reminder emails for locked/in_review unpaid dossiers.
// - Reminder days: 3, 7, 10.
// - Existing mail-worker sends queued outbound_emails.
//
// Boundaries:
// - Does not mutate dossier lifecycle.
// - Does not mutate payment/export state.
// - Does not perform retention cleanup.
// - No scheduler yet; manual proof first.

const REMINDER_CONFIG = {
  reminderDays: [3, 7, 10],
  batchLimit: 10,
  workerSecretHeader: "x-locked-unpaid-reminder-worker-secret",
  actorRef: "system:locked-unpaid-reminder-worker",
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

async function runWorker(req: Request) {
  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const WORKER_SECRET = getEnv("LOCKED_UNPAID_REMINDER_WORKER_SECRET");

  const incomingSecret = req.headers.get(REMINDER_CONFIG.workerSecretHeader);
  if (incomingSecret !== WORKER_SECRET) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const meta = getReqMeta(req);
  const body = await readJsonBody(req);

  const apply = asBool(body.apply, false);
  const nowOverride = asStringOrNull(body.now);
  const targetDossierId = asStringOrNull(body.target_dossier_id);
  const limit = asInt(body.limit, REMINDER_CONFIG.batchLimit, 1, 100);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("enval_queue_locked_unpaid_reminders", {
    p_apply: apply,
    p_now: nowOverride || new Date().toISOString(),
    p_target_dossier_id: targetDossierId,
    p_limit: limit,
    p_reminder_days: REMINDER_CONFIG.reminderDays,
    p_request_id: meta.request_id,
    p_environment: meta.environment,
  });

  if (error) {
    return jsonResponse({
      ok: false,
      error: "locked_unpaid_reminder_worker_failed",
      message: error.message,
      details: error,
    }, 500);
  }

  const rows = Array.isArray(data) ? data : [];

  return jsonResponse({
    ok: true,
    apply,
    config: {
      ...REMINDER_CONFIG,
      actorRef: REMINDER_CONFIG.actorRef,
    },
    target_dossier_id: targetDossierId,
    candidate_count: rows.length,
    queued_count: rows.filter((r: any) => r?.queued === true).length,
    skipped_count: rows.filter((r: any) => r?.skipped_reason).length,
    results: rows.map((r: any) => ({
      dossier_id: r.dossier_id,
      reminder_day: r.reminder_day,
      due_at: r.due_at,
      locked_at: r.locked_at,
      dossier_status: r.dossier_status,
      apply: r.apply,
      queued: r.queued,
      skipped_reason: r.skipped_reason,
      outbound_email_id: r.outbound_email_id,
      reminder_event_id: r.reminder_event_id,
      message_type: r.message_type,
    })),
  });
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    return await runWorker(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("locked-unpaid-reminder-worker fatal:", err);
    return jsonResponse({ ok: false, error: "Internal error", message: msg }, 500);
  }
});
