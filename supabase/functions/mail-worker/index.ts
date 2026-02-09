// supabase/functions/mail-worker/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFromHeader(fromEmailRaw: string, fromNameRaw?: string) {
  const email = String(fromEmailRaw || "").trim();
  const name = String(fromNameRaw || "").trim();

  if (email.includes("<") && email.includes(">")) return email;
  if (name) return `${name} <${email}>`;
  return email;
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function isoNow() {
  return new Date().toISOString();
}

function parseIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("cf-connecting-ip") || null;
}

function getReqId(req: Request) {
  return req.headers.get("x-request-id") || crypto.randomUUID();
}

function backoffMs(attempt: number) {
  // attempt = 1..N
  const base = 30_000; // 30s
  const cap = 30 * 60_000; // 30m
  const ms = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(ms, cap);
}

const MAX_BATCH = 5;
const MAX_ATTEMPTS = 5;

// resends throttle
const PER_MAIL_DELAY_MS = 600;

// processing-stuck recovery window
const STUCK_PROCESSING_MS = 10 * 60_000; // 10 minuten

// fail-open audit insert (alleen dossier-scoped)
async function insertAuditFailOpen(
  supabase: ReturnType<typeof createClient>,
  row: {
    dossier_id: string;
    event_type: string;
    actor_type: "system";
    event_data: Record<string, unknown>;
  },
) {
  try {
    const { error } = await supabase.from("dossier_audit_events").insert([row]);
    if (error) console.error("audit insert failed (fail-open):", error);
  } catch (e) {
    console.error("audit insert threw (fail-open):", e);
  }
}

serve(async (req: Request) => {
  try {
    const SUPABASE_URL = getEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = getEnv("RESEND_API_KEY");
    const FROM_EMAIL = getEnv("FROM_EMAIL");
    const MAIL_WORKER_SECRET = getEnv("MAIL_WORKER_SECRET");

    const incoming = req.headers.get("x-mail-worker-secret");
    if (incoming !== MAIL_WORKER_SECRET) return new Response("Unauthorized", { status: 401 });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const request_id = getReqId(req);
    const ip = parseIp(req);
    const ua = req.headers.get("user-agent");
    const environment = Deno.env.get("ENVIRONMENT") || Deno.env.get("DENO_ENV") || "unknown";

    // -----------------------------
    // (P1) Recovery: stuck processing
    // -----------------------------
    const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_MS).toISOString();

    // We select first so we can log dossier-scoped audit per row (fail-open).
    const { data: stuckRows, error: stuckSelErr } = await supabase
      .from("outbound_emails")
      .select("id,dossier_id,to_email,message_type,attempts,last_attempt_at")
      .eq("status", "processing")
      .lt("last_attempt_at", stuckCutoff)
      .limit(50);

    if (stuckSelErr) {
      console.error("stuck select error (fail-open):", stuckSelErr);
    } else if (stuckRows && stuckRows.length > 0) {
      for (const r of stuckRows as any[]) {
        const attempts = Number(r.attempts ?? 0);
        const dossierId = (r.dossier_id as string | null) ?? null;

        const finalStatus = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
        const nextAttemptAt =
          finalStatus === "queued" ? new Date(Date.now() + backoffMs(Math.max(1, attempts))).toISOString() : null;

        // optimistic update: only if still processing and still older than cutoff
        const { data: upd, error: updErr } = await supabase
          .from("outbound_emails")
          .update({
            status: finalStatus,
            // keep sent_at/provider_id untouched; we are recovering a processing lock
            next_attempt_at: nextAttemptAt,
            error_message: `Recovered stuck processing (timeout ${STUCK_PROCESSING_MS}ms)`,
          })
          .eq("id", r.id)
          .eq("status", "processing")
          .lt("last_attempt_at", stuckCutoff)
          .select("id")
          .maybeSingle();

        if (updErr || !upd) continue;

        if (dossierId) {
          await insertAuditFailOpen(supabase, {
            dossier_id: dossierId,
            actor_type: "system",
            event_type: finalStatus === "queued" ? "mail_requeued" : "mail_failed",
            event_data: {
              request_id,
              actor_ref: "system:mail-worker",
              ip,
              ua,
              environment,
              outbound_email_id: r.id,
              message_type: r.message_type ?? "generic",
              to_email: r.to_email ?? null,
              attempts,
              status: finalStatus,
              reason: "stuck_processing_timeout",
              last_attempt_at: r.last_attempt_at ?? null,
              next_attempt_at: nextAttemptAt,
            },
          });
        }
      }
    }

    const now = new Date().toISOString();

    // Select queued mails die eligible zijn:
    // - status=queued
    // - attempts < MAX_ATTEMPTS
    // - next_attempt_at <= now OR next_attempt_at is null
    const { data: emails, error } = await supabase
      .from("outbound_emails")
      .select("*")
      .eq("status", "queued")
      .lt("attempts", MAX_ATTEMPTS)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(MAX_BATCH);

    if (error) {
      console.error("select error", error);
      return new Response("select error", { status: 500 });
    }

    if (!emails || emails.length === 0) return new Response("No queued emails");

    for (const mail of emails) {
      // Guard: provider_id bestaat → markeer als sent en skip
      if ((mail as any).provider_id) {
        await supabase
          .from("outbound_emails")
          .update({
            status: "sent",
            error_message: null,
            next_attempt_at: null,
          })
          .eq("id", mail.id);
        continue;
      }

      const lockNow = isoNow();

      // Lock: queued -> processing (atomaire update op status=queued)
      const { data: locked, error: lockError } = await supabase
        .from("outbound_emails")
        .update({
          status: "processing",
          attempts: (mail.attempts ?? 0) + 1,
          last_attempt_at: lockNow,
          // next_attempt_at leeg tijdens processing
          next_attempt_at: null,
        })
        .eq("id", mail.id)
        .eq("status", "queued")
        .select();

      if (lockError || !locked || locked.length === 0) continue;

      const attempts = (mail.attempts ?? 0) + 1;
      const dossierId = (mail as any).dossier_id as string | null;

      try {
        const fromEmail = String((mail as any).from_email || FROM_EMAIL).trim();
        const fromName = String((mail as any).from_name || "Enval").trim();
        const fromHeader = buildFromHeader(fromEmail, fromName);

        const payload: Record<string, unknown> = {
          from: fromHeader,
          to: mail.to_email,
          subject: mail.subject,
          text: mail.body,
        };

        if ((mail as any).reply_to) payload["reply_to"] = (mail as any).reply_to;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Resend HTTP ${res.status}`);
        }

        const j = await res.json().catch(() => ({}));
        const sentAt = isoNow();
        const providerId = (j as any)?.id ?? null;

        const { error: sentErr } = await supabase
          .from("outbound_emails")
          .update({
            status: "sent",
            sent_at: sentAt,
            provider_id: providerId,
            error_message: null,
            next_attempt_at: null,
          })
          .eq("id", mail.id);

        if (sentErr) {
          console.error("mark sent failed", sentErr);

          const finalStatus = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
          const nextAttemptAt =
            finalStatus === "queued" ? new Date(Date.now() + backoffMs(attempts)).toISOString() : null;

          await supabase
            .from("outbound_emails")
            .update({
              status: finalStatus,
              sent_at: null,
              error_message: `Sent via Resend but DB update failed: ${sentErr.message}`,
              next_attempt_at: nextAttemptAt,
            })
            .eq("id", mail.id);

          if (dossierId) {
            await insertAuditFailOpen(supabase, {
              dossier_id: dossierId,
              actor_type: "system",
              event_type: finalStatus === "queued" ? "mail_requeued" : "mail_failed",
              event_data: {
                request_id,
                actor_ref: "system:mail-worker",
                ip,
                ua,
                environment,
                outbound_email_id: mail.id,
                message_type: (mail as any).message_type ?? "generic",
                to_email: mail.to_email,
                attempts,
                status: finalStatus,
                reason: "sent_db_update_failed",
                provider: "resend",
                provider_id: providerId,
                next_attempt_at: nextAttemptAt,
              },
            });
          }

          await sleep(PER_MAIL_DELAY_MS);
          continue;
        }

        if (dossierId) {
          await insertAuditFailOpen(supabase, {
            dossier_id: dossierId,
            actor_type: "system",
            event_type: "mail_sent",
            event_data: {
              request_id,
              actor_ref: "system:mail-worker",
              ip,
              ua,
              environment,
              outbound_email_id: mail.id,
              message_type: (mail as any).message_type ?? "generic",
              to_email: mail.to_email,
              attempts,
              status: "sent",
              provider: "resend",
              provider_id: providerId,
              sent_at: sentAt,
            },
          });
        }

        await sleep(PER_MAIL_DELAY_MS);
      } catch (err: any) {
        const msg = err?.message ?? String(err);

        if (attempts >= MAX_ATTEMPTS) {
          await supabase
            .from("outbound_emails")
            .update({
              status: "failed",
              sent_at: null,
              error_message: msg,
              next_attempt_at: null,
            })
            .eq("id", mail.id);

          if (dossierId) {
            await insertAuditFailOpen(supabase, {
              dossier_id: dossierId,
              actor_type: "system",
              event_type: "mail_failed",
              event_data: {
                request_id,
                actor_ref: "system:mail-worker",
                ip,
                ua,
                environment,
                outbound_email_id: mail.id,
                message_type: (mail as any).message_type ?? "generic",
                to_email: mail.to_email,
                attempts,
                status: "failed",
                reason: "max_attempts",
                error_message: msg,
              },
            });
          }
        } else {
          const nextAttemptAt = new Date(Date.now() + backoffMs(attempts)).toISOString();

          await supabase
            .from("outbound_emails")
            .update({
              status: "queued",
              sent_at: null,
              error_message: msg,
              next_attempt_at: nextAttemptAt,
            })
            .eq("id", mail.id);

          if (dossierId) {
            await insertAuditFailOpen(supabase, {
              dossier_id: dossierId,
              actor_type: "system",
              event_type: "mail_requeued",
              event_data: {
                request_id,
                actor_ref: "system:mail-worker",
                ip,
                ua,
                environment,
                outbound_email_id: mail.id,
                message_type: (mail as any).message_type ?? "generic",
                to_email: mail.to_email,
                attempts,
                status: "queued",
                reason: "provider_error",
                error_message: msg,
                next_attempt_at: nextAttemptAt,
              },
            });
          }
        }
      }
    }

    return new Response("Processed batch");
  } catch (e) {
    console.error("mail-worker fatal:", e);
    return new Response("Internal error", { status: 500 });
  }
});
