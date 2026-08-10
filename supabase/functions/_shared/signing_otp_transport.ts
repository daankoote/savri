import {
  isLocalSupabaseRuntime,
  type ServerRuntimeEnvironment,
} from "./local_supabase_runtime.ts";

export type SigningOtpDeliveryRequest = {
  challengeReference: string;
  verifiedChannelReference: string;
  deliveryTarget: string;
  secretCode: string;
  expiresAt: string;
  templateVersion: "signup-signing-otp-nl-v1";
  requestReference: string;
};

export type SigningOtpDeliveryResult = {
  delivered: boolean;
  transportId: string;
  providerDeliveryReference?: string;
  safeFailureCode?:
    | "transport_unavailable"
    | "delivery_failed"
    | "configuration_invalid";
};

export interface SigningOtpTransportPort {
  readonly transportId: string;
  deliver(
    request: SigningOtpDeliveryRequest,
  ): Promise<SigningOtpDeliveryResult>;
}

async function readSmtpReply(conn: Deno.Conn): Promise<number> {
  const buffer = new Uint8Array(2048);
  let text = "";
  for (let reads = 0; reads < 8; reads += 1) {
    const count = await conn.read(buffer);
    if (count === null) break;
    text += new TextDecoder().decode(buffer.subarray(0, count));
    const lines = text.split("\r\n").filter(Boolean);
    const last = lines.at(-1) || "";
    if (/^\d{3} /.test(last)) return Number(last.slice(0, 3));
  }
  return 0;
}

async function smtpCommand(
  conn: Deno.Conn,
  command: string,
  expected: number[],
): Promise<void> {
  await conn.write(new TextEncoder().encode(`${command}\r\n`));
  const status = await readSmtpReply(conn);
  if (!expected.includes(status)) throw new Error("smtp_delivery_failed");
}

export class LocalMailpitSigningOtpTransportAdapter
  implements SigningOtpTransportPort {
  readonly transportId = "local_mailpit_v1";

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly sender: string,
  ) {}

  async deliver(
    request: SigningOtpDeliveryRequest,
  ): Promise<SigningOtpDeliveryResult> {
    let conn: Deno.Conn | null = null;
    try {
      conn = await Deno.connect({ hostname: this.host, port: this.port });
      const greeting = await readSmtpReply(conn);
      if (greeting !== 220) throw new Error("smtp_unavailable");
      await smtpCommand(conn, "EHLO enval.local", [250]);
      await smtpCommand(conn, `MAIL FROM:<${this.sender}>`, [250]);
      await smtpCommand(conn, `RCPT TO:<${request.deliveryTarget}>`, [
        250,
        251,
      ]);
      await smtpCommand(conn, "DATA", [354]);
      const body = [
        `From: ENVAL <${this.sender}>`,
        `To: ${request.deliveryTarget}`,
        "Subject: Je ENVAL ondertekencode",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        "Gebruik deze eenmalige code om je ENVAL-aanmelding te ondertekenen:",
        "",
        request.secretCode,
        "",
        "De code verloopt binnen tien minuten. Deel deze code niet.",
        "",
        `Referentie: ${request.challengeReference}`,
      ].join("\r\n").replaceAll("\r\n.", "\r\n..");
      await smtpCommand(conn, `${body}\r\n.`, [250]);
      await smtpCommand(conn, "QUIT", [221]);
      return {
        delivered: true,
        transportId: this.transportId,
        providerDeliveryReference: `mailpit:${request.challengeReference}`,
      };
    } catch (_error) {
      return {
        delivered: false,
        transportId: this.transportId,
        safeFailureCode: conn ? "delivery_failed" : "transport_unavailable",
      };
    } finally {
      try {
        conn?.close();
      } catch (_error) {
        // no-op
      }
    }
  }
}

export class ConfiguredSigningOtpTransportAdapter
  implements SigningOtpTransportPort {
  readonly transportId = "configured_http_v1";

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
  ) {}

  async deliver(
    request: SigningOtpDeliveryRequest,
  ): Promise<SigningOtpDeliveryResult> {
    if (!this.endpoint || !this.apiKey) {
      return {
        delivered: false,
        transportId: this.transportId,
        safeFailureCode: "configuration_invalid",
      };
    }
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: request.deliveryTarget,
          template: request.templateVersion,
          code: request.secretCode,
          expires_at: request.expiresAt,
          reference: request.challengeReference,
        }),
      });
      return response.ok
        ? { delivered: true, transportId: this.transportId }
        : {
          delivered: false,
          transportId: this.transportId,
          safeFailureCode: "delivery_failed",
        };
    } catch (_error) {
      return {
        delivered: false,
        transportId: this.transportId,
        safeFailureCode: "transport_unavailable",
      };
    }
  }
}

export function resolveSigningOtpTransport(
  environment: ServerRuntimeEnvironment = Deno.env,
): SigningOtpTransportPort | null {
  const localRuntime = isLocalSupabaseRuntime(
    environment.get("SUPABASE_URL") || "",
  );
  const configuredDriver =
    (environment.get("SIGNING_OTP_TRANSPORT_DRIVER") || "")
      .trim().toLowerCase();
  const driver = configuredDriver || (localRuntime ? "local_mailpit" : "");
  if (driver === "local_mailpit") {
    if (!localRuntime) return null;
    const port = Number(
      environment.get("SIGNING_OTP_LOCAL_SMTP_PORT") || "1025",
    );
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return new LocalMailpitSigningOtpTransportAdapter(
      environment.get("SIGNING_OTP_LOCAL_SMTP_HOST") || "inbucket",
      port,
      environment.get("SIGNING_OTP_LOCAL_SENDER") || "noreply@enval.local",
    );
  }
  if (driver === "configured_http") {
    const endpoint = environment.get("SIGNING_OTP_PROVIDER_ENDPOINT") || "";
    const apiKey = environment.get("SIGNING_OTP_PROVIDER_API_KEY") || "";
    return endpoint && apiKey
      ? new ConfiguredSigningOtpTransportAdapter(endpoint, apiKey)
      : null;
  }
  return null;
}
