import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { resolveWorkflowEmailTransport } from "../_shared/workflow_email_transport.ts";
import { runWorkflowEmailWorker } from "../_shared/workflow_email_worker.ts";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sameSecret(actual: string, expected: string): Promise<boolean> {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

serve(async (request) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = request.headers.get("Authorization") || "";
  if (!await sameSecret(authorization, `Bearer ${serviceRoleKey}`)) {
    return json({ ok: false, error: "authentication_required" }, 401);
  }
  const transport = resolveWorkflowEmailTransport();
  if (!transport) {
    return json({ ok: false, error: "workflow_email_transport_disabled" }, 503);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      { ok: false, error: "workflow_email_configuration_invalid" },
      503,
    );
  }

  try {
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const result = await runWorkflowEmailWorker(client, transport);
    return json({ ok: true, ...result });
  } catch (_error) {
    return json({ ok: false, error: "workflow_email_worker_failed" }, 500);
  }
});
