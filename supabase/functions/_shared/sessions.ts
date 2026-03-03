// supabase/functions/_shared/sessions.ts
import type { ReqMeta } from "./reqmeta.ts";
import { insertAuditFailOpen } from "./audit.ts";

export async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randToken(lenBytes = 24) {
  const b = new Uint8Array(lenBytes);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export type SessionAuthResult =
  | { ok: true; dossier_id: string; session_id: string; session_token_hash: string }
  | { ok: false; status: number; error: string; reason: string };

export async function authSession(
  SB: any,
  dossier_id: string,
  session_token_raw: string,
  meta: ReqMeta,
): Promise<SessionAuthResult> {
  const tokenHash = await sha256Hex(session_token_raw);
  const now = new Date().toISOString();

  const { data: sess, error } = await SB
    .from("dossier_sessions")
    .select("id,dossier_id,expires_at,revoked_at")
    .eq("dossier_id", dossier_id)
    .eq("session_token_hash", tokenHash)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message, reason: "db_read" };
  if (!sess) return { ok: false, status: 401, error: "Unauthorized", reason: "session_not_found" };

  if (sess.revoked_at) return { ok: false, status: 401, error: "Unauthorized", reason: "session_revoked" };
  if (String(sess.expires_at) <= now) return { ok: false, status: 401, error: "Unauthorized", reason: "session_expired" };

  // fail-open last_seen update
  SB.from("dossier_sessions")
    .update({ last_seen_at: now })
    .eq("id", sess.id);

  return { ok: true, dossier_id, session_id: sess.id, session_token_hash: tokenHash };
}

export async function auditSessionRejectFailOpen(
  SB: any,
  dossier_id: string,
  meta: ReqMeta,
  event_type: string,
  reason: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type,
      event_data: {
        stage: "auth",
        status: 401,
        reason,
        message,
        ...(extra || {}),
      },
    },
    meta,
    { actor_ref: `dossier:${dossier_id}|session:invalid` },
  );
}