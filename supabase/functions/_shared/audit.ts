// supabase/functions/_shared/audit.ts
import type { ReqMeta } from "./reqmeta.ts";

export type AuditInsert = {
  dossier_id: string;
  actor_type: "customer" | "installer" | "system" | "admin";
  event_type: string;
  event_data?: Record<string, unknown>;
};

function getEnvironment(): string {
  return (Deno.env.get("ENVIRONMENT") || Deno.env.get("ENV") || "unknown").trim().toLowerCase();
}

/**
 * insertAuditFailOpen
 * - fail-open (audit mag nooit blokkeren)
 * - injecteert MLS standaardvelden in event_data:
 *   environment, request_id, idempotency_key, ip, ua
 */
export async function insertAuditFailOpen(
  SB: any,
  base: AuditInsert,
  meta?: ReqMeta,
  extra?: Record<string, unknown>,
) {
  try {
    const merged: Record<string, unknown> = {
      environment: getEnvironment(),
      ...(base.event_data || {}),
      ...(extra || {}),
    };

    if (meta) {
      merged.request_id = meta.request_id;
      if (meta.idempotency_key) merged.idempotency_key = meta.idempotency_key;
      if (meta.ip) merged.ip = meta.ip;
      if (meta.ua) merged.ua = meta.ua;
    }

    await SB.from("dossier_audit_events").insert([{
      dossier_id: base.dossier_id,
      actor_type: base.actor_type,
      event_type: base.event_type,
      event_data: merged,
    }]);
  } catch (_e) {
    // fail-open
  }
}

/**
 * Idempotency helpers (server-side)
 * - key = meta.idempotency_key || meta.request_id
 * - only used when caller chooses to use it
 */
export async function tryGetIdempotentResponse(
  SB: any,
  key: string,
): Promise<{ status: number; body: any } | null> {
  try {
    const { data, error } = await SB
      .from("idempotency_keys")
      .select("response_status, response_body")
      .eq("key", key)
      .maybeSingle();

    if (error) return null;
    if (!data) return null;
    if (data.response_status == null || data.response_body == null) return null;

    return {
      status: Number(data.response_status),
      body: data.response_body,
    };
  } catch (_e) {
    return null;
  }
}

export async function storeIdempotentResponseFailOpen(
  SB: any,
  key: string,
  status: number,
  body: any,
) {
  try {
    await SB.from("idempotency_keys").upsert([{
      key,
      response_status: status,
      response_body: body,
    }], { onConflict: "key" });
  } catch (_e) {
    // fail-open
  }
}
