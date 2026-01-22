// supabase/functions/_shared/reqmeta.ts
export type ReqMeta = {
  request_id: string | null;
  ip: string | null;
  ua: string | null;
};

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return null;
}

export function getRequestId(req: Request): string | null {
  return firstNonEmpty(
    req.headers.get("Idempotency-Key"),
    req.headers.get("idempotency-key"),
    req.headers.get("x-request-id"),
    req.headers.get("X-Request-Id"),
  );
}

export function getIp(req: Request): string | null {
  // Netlify / proxies / CDNs (best-effort)
  const xff = req.headers.get("x-forwarded-for") || req.headers.get("X-Forwarded-For") || "";
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  return firstNonEmpty(
    req.headers.get("cf-connecting-ip"),
    req.headers.get("CF-Connecting-IP"),
    req.headers.get("x-real-ip"),
    req.headers.get("X-Real-IP"),
    req.headers.get("client-ip"),
    req.headers.get("Client-IP"),
  );
}

export function getUa(req: Request): string | null {
  return firstNonEmpty(req.headers.get("user-agent"), req.headers.get("User-Agent"));
}

export function getReqMeta(req: Request): ReqMeta {
  return {
    request_id: getRequestId(req),
    ip: getIp(req),
    ua: getUa(req),
  };
}
