// supabase/functions/_shared/idempotency.ts

export async function reserveIdempotencyKey(SB: any, key: string) {
  // Requires PK/unique constraint on public.idempotency_keys.key
  const { error } = await SB.from("idempotency_keys").insert([{ key }]);
  return error; // null when reserved
}

export async function tryReplayIdempotency(
  SB: any,
  key: string,
): Promise<{ status: number; body: any } | null> {
  const { data, error } = await SB
    .from("idempotency_keys")
    .select("response_status,response_body")
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(`Idempotency lookup failed: ${error.message}`);
  if (!data) return null;
  if (data.response_status == null || data.response_body == null) return null;

  return { status: Number(data.response_status), body: data.response_body };
}

export async function finalizeIdempotencyFailOpen(
  SB: any,
  key: string,
  status: number,
  body: any,
) {
  try {
    await SB
      .from("idempotency_keys")
      .update({ response_status: status, response_body: body })
      .eq("key", key);
  } catch (_e) {
    // fail-open
  }
}

export async function withIdempotencyStrict(
  SB: any,
  key: string,
  handler: () => Promise<{ status: number; body: any }>,
): Promise<{ status: number; body: any }> {
  const reserveErr = await reserveIdempotencyKey(SB, key);

  if (reserveErr) {
    const cached = await tryReplayIdempotency(SB, key);
    if (cached) return cached;
    return { status: 409, body: { ok: false, error: "Request already in progress" } };
  }

  const { status, body } = await handler();
  await finalizeIdempotencyFailOpen(SB, key, status, body);
  return { status, body };
}
