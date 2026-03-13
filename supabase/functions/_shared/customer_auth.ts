// supabase/functions/_shared/customer_auth.ts

import type { ReqMeta } from "./reqmeta.ts";
import { authSession, auditSessionRejectFailOpen } from "./sessions.ts";

export type CustomerSessionAuthOk = {
  ok: true;
  dossier_id: string;
  session_id: string;
  session_token_hash: string;
  actor_ref: string;
};

export type CustomerSessionAuthFail = {
  ok: false;
  status: number;
  error: string;
  reason: string;
};

export type CustomerSessionAuthResult =
  | CustomerSessionAuthOk
  | CustomerSessionAuthFail;

export function actorRefForSession(dossierId: string, sessionTokenHash: string): string {
  return `dossier:${dossierId}|session:${sessionTokenHash.slice(0, 16)}`;
}

export function scopedSessionIdemKey(
  dossierId: string,
  sessionTokenHash: string,
  rawKey: string,
): string {
  return `dossier:${dossierId}|session:${sessionTokenHash.slice(0, 16)}|idem:${rawKey}`;
}

export async function requireCustomerSession(
  SB: any,
  dossier_id: string | null,
  session_token: string | null,
  meta: ReqMeta,
  rejectEventType: string,
): Promise<CustomerSessionAuthResult> {
  if (!dossier_id || !session_token) {
    return {
      ok: false,
      status: 400,
      error: "Missing dossier_id/session_token",
      reason: "missing_session_scope",
    };
  }

  const auth = await authSession(SB, dossier_id, session_token, meta);

  if (!auth.ok) {
    await auditSessionRejectFailOpen(
      SB,
      dossier_id,
      meta,
      rejectEventType,
      auth.reason,
      auth.error,
    );

    return {
      ok: false,
      status: auth.status,
      error: auth.error,
      reason: auth.reason,
    };
  }

  return {
    ok: true,
    dossier_id: auth.dossier_id,
    session_id: auth.session_id,
    session_token_hash: auth.session_token_hash,
    actor_ref: actorRefForSession(auth.dossier_id, auth.session_token_hash),
  };
}