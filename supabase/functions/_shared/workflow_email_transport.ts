import {
  isLocalSupabaseRuntime,
  type ServerRuntimeEnvironment,
} from "./local_supabase_runtime.ts";
import { sendLocalPlainTextMail } from "./local_mailpit_smtp.ts";

export type WorkflowEmailDeliveryRequest = Readonly<{
  recipientEmail: string;
  subject: string;
  body: string;
  providerIdempotencyKey: string;
}>;

export type WorkflowEmailDeliveryResult = Readonly<{
  outcome:
    | "provider_accepted"
    | "retryable_failure"
    | "permanent_failure"
    | "ambiguous_failure";
  providerReference?: string;
  safeErrorClass?:
    | "transport_unavailable"
    | "delivery_failed"
    | "configuration_invalid"
    | "provider_ambiguous";
}>;

export interface WorkflowEmailTransportPort {
  readonly transportId: "local_mailpit_v1";
  deliver(
    request: WorkflowEmailDeliveryRequest,
  ): Promise<WorkflowEmailDeliveryResult>;
}

export class LocalMailpitWorkflowEmailTransportAdapter
  implements WorkflowEmailTransportPort {
  readonly transportId = "local_mailpit_v1" as const;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly sender: string,
  ) {}

  async deliver(
    request: WorkflowEmailDeliveryRequest,
  ): Promise<WorkflowEmailDeliveryResult> {
    const result = await sendLocalPlainTextMail(this.host, this.port, {
      sender: this.sender,
      senderName: "ENVAL",
      recipient: request.recipientEmail,
      subject: request.subject,
      body: request.body,
    });
    if (result.accepted) {
      return {
        outcome: "provider_accepted",
        providerReference: `mailpit:${
          request.providerIdempotencyKey.slice(-64)
        }`,
      };
    }
    if (result.safeFailureCode === "delivery_ambiguous") {
      return {
        outcome: "ambiguous_failure",
        safeErrorClass: "provider_ambiguous",
      };
    }
    return {
      outcome: "retryable_failure",
      safeErrorClass: result.safeFailureCode || "delivery_failed",
    };
  }
}

export function resolveWorkflowEmailTransport(
  environment: ServerRuntimeEnvironment = Deno.env,
): WorkflowEmailTransportPort | null {
  if (!isLocalSupabaseRuntime(environment.get("SUPABASE_URL") || "")) {
    return null;
  }
  const port = Number(
    environment.get("WORKFLOW_EMAIL_LOCAL_SMTP_PORT") || "1025",
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return new LocalMailpitWorkflowEmailTransportAdapter(
    environment.get("WORKFLOW_EMAIL_LOCAL_SMTP_HOST") || "inbucket",
    port,
    environment.get("WORKFLOW_EMAIL_LOCAL_SENDER") || "noreply@enval.local",
  );
}
