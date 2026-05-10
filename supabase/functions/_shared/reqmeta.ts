export type ReqMeta = {
  request_id: string; // ALWAYS present
  idempotency_key: string | null; // header if provided
  ip: string | null;
  ua: string | null;
  origin: string | null;
  environment: string;
};

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return null;
}

export function getIdempotencyKey(req: Request): string | null {
  return firstNonEmpty(
    req.headers.get("Idempotency-Key"),
    req.headers.get("idempotency-key"),
  );
}

export function getRequestId(req: Request): string {
  const rid = firstNonEmpty(
    req.headers.get("x-request-id"),
    req.headers.get("X-Request-Id"),
    getIdempotencyKey(req),
  );
  return rid || crypto.randomUUID();
}

export function getIp(req: Request): string | null {
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

export function getOrigin(req: Request): string | null {
  return firstNonEmpty(
    req.headers.get("origin"),
    req.headers.get("Origin"),
  );
}

export function getEnvironment(): string {
  return firstNonEmpty(
    Deno.env.get("ENVIRONMENT"),
    Deno.env.get("ENV"),
  ) || "unknown";
}

export function getReqMeta(req: Request): ReqMeta {
  return {
    request_id: getRequestId(req),
    idempotency_key: getIdempotencyKey(req),
    ip: getIp(req),
    ua: getUa(req),
    origin: getOrigin(req),
    environment: getEnvironment(),
  };
}