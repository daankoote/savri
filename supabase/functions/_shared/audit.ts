// supabase/functions/_shared/audit.ts
import type { ReqMeta } from "./reqmeta.ts";

export type AuditInsert = {
  dossier_id: string;
  actor_type: "customer" | "installer" | "system" | "admin";
  event_type: string;
  event_data?: Record<string, unknown>;
};

export async function insertAuditFailOpen(
  SB: any,
  base: AuditInsert,
  meta?: ReqMeta,
  extra?: Record<string, unknown>,
) {
  try {
    const merged: Record<string, unknown> = {
      ...(base.event_data || {}),
      ...(extra || {}),
    };

    if (meta) {
      // Standaard correlatievelden (append-only in event_data)
      if (meta.request_id) merged.request_id = meta.request_id;
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
    // fail-open: audit mag nooit de flow blokkeren
  }
}
