import {
  isLocalSupabaseRuntime,
  type ServerRuntimeEnvironment,
} from "./local_supabase_runtime.ts";
import { sendLocalPlainTextMail } from "./local_mailpit_smtp.ts";

export type SigningOtpDeliveryRequest = {
  challengeReference: string;
  verifiedChannelReference: string;
  deliveryTarget: string;
  secretCode: string;
  expiresAt: string;
  templateVersion:
    | "signup-signing-otp-nl-v1"
    | "customer-correction-signing-otp-nl-v1";
  requestReference: string;
  displayName: string;
  senderName: string;
  senderAddress: string;
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

export function createSigningOtpMailContent(
  request: SigningOtpDeliveryRequest,
): Readonly<{
  senderName: string;
  senderAddress: string;
  subject: string;
  body: string;
}> {
  const purpose = request.templateVersion ===
      "customer-correction-signing-otp-nl-v1"
    ? `je correctie op je ${request.displayName}-dossier te ondertekenen`
    : `je ${request.displayName}-aanmelding te ondertekenen`;
  return Object.freeze({
    senderName: request.senderName,
    senderAddress: request.senderAddress,
    subject: `Je ${request.displayName} ondertekencode`,
    body: [
      `Gebruik deze eenmalige code om ${purpose}:`,
      "",
      request.secretCode,
      "",
      "De code verloopt binnen tien minuten. Deel deze code niet.",
      "",
      `Referentie: ${request.challengeReference}`,
    ].join("\r\n"),
  });
}

export class LocalMailpitSigningOtpTransportAdapter
  implements SigningOtpTransportPort {
  readonly transportId = "local_mailpit_v1";

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  async deliver(
    request: SigningOtpDeliveryRequest,
  ): Promise<SigningOtpDeliveryResult> {
    const content = createSigningOtpMailContent(request);
    const result = await sendLocalPlainTextMail(this.host, this.port, {
      sender: content.senderAddress,
      senderName: content.senderName,
      recipient: request.deliveryTarget,
      subject: content.subject,
      body: content.body,
    });
    if (result.accepted) {
      return {
        delivered: true,
        transportId: this.transportId,
        providerDeliveryReference: `mailpit:${request.challengeReference}`,
      };
    }
    return {
      delivered: false,
      transportId: this.transportId,
      safeFailureCode: result.safeFailureCode === "delivery_ambiguous"
        ? "delivery_failed"
        : result.safeFailureCode,
    };
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
          display_name: request.displayName,
          sender_name: request.senderName,
          sender_address: request.senderAddress,
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
