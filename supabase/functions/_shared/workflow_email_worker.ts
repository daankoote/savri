import type { WorkflowEmailTransportPort } from "./workflow_email_transport.ts";

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;

export interface WorkflowEmailWorkerClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>;
}

type ClaimedDelivery = Readonly<{
  deliveryId: string;
  leaseToken: string;
  recipientEmail: string;
  subject: string;
  body: string;
  senderDisplayName: string;
  senderAddress: string;
  presentationConfigVersion: string;
  providerIdempotencyKey: string;
}>;

export type WorkflowEmailWorkerResult = Readonly<{
  claimed: number;
  providerAccepted: number;
  failed: number;
}>;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseClaim(value: unknown): ClaimedDelivery | null | false {
  if (!isObject(value) || value.ok !== true || !("delivery" in value)) {
    return false;
  }
  if (value.delivery === null) return null;
  if (!isObject(value.delivery)) return false;
  const delivery = value.delivery;
  const expected = [
    "attempt_number",
    "body",
    "delivery_id",
    "lease_token",
    "provider_idempotency_key",
    "recipient_email",
    "sender_address",
    "sender_display_name",
    "subject",
    "template_key",
    "presentation_config_version",
  ].sort();
  const actual = Object.keys(delivery).sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index]) ||
    typeof delivery.delivery_id !== "string" ||
    typeof delivery.lease_token !== "string" ||
    typeof delivery.recipient_email !== "string" ||
    typeof delivery.subject !== "string" ||
    typeof delivery.body !== "string" ||
    typeof delivery.sender_display_name !== "string" ||
    typeof delivery.sender_address !== "string" ||
    typeof delivery.presentation_config_version !== "string" ||
    typeof delivery.provider_idempotency_key !== "string" ||
    ![
      "information-request-created-customer-nl-v1",
      "information-request-created-customer-nl-v2",
      "information-request-answered-workforce-nl-v1",
      "information-request-withdrawn-customer-nl-v1",
    ].includes(String(delivery.template_key)) ||
    !Number.isInteger(delivery.attempt_number)
  ) return false;
  return {
    deliveryId: delivery.delivery_id,
    leaseToken: delivery.lease_token,
    recipientEmail: delivery.recipient_email,
    subject: delivery.subject,
    body: delivery.body,
    senderDisplayName: delivery.sender_display_name,
    senderAddress: delivery.sender_address,
    presentationConfigVersion: delivery.presentation_config_version,
    providerIdempotencyKey: delivery.provider_idempotency_key,
  };
}

export async function runWorkflowEmailWorker(
  client: WorkflowEmailWorkerClient,
  transport: WorkflowEmailTransportPort,
  batchLimit = 5,
): Promise<WorkflowEmailWorkerResult> {
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 5) {
    throw new Error("workflow_email_batch_limit_invalid");
  }
  let claimed = 0;
  let providerAccepted = 0;
  let failed = 0;

  while (claimed < batchLimit) {
    const claimResult = await client.rpc("app_workflow_email_claim_v1");
    if (claimResult.error) throw new Error("workflow_email_claim_failed");
    const claim = parseClaim(claimResult.data);
    if (claim === false) {
      throw new Error("workflow_email_claim_contract_invalid");
    }
    if (claim === null) break;
    claimed += 1;

    let delivery;
    try {
      delivery = await transport.deliver({
        recipientEmail: claim.recipientEmail,
        senderName: claim.senderDisplayName,
        senderAddress: claim.senderAddress,
        subject: claim.subject,
        body: claim.body,
        providerIdempotencyKey: claim.providerIdempotencyKey,
      });
    } catch (_error) {
      delivery = {
        outcome: "ambiguous_failure" as const,
        safeErrorClass: "provider_ambiguous" as const,
      };
    }

    const completion = await client.rpc("app_workflow_email_complete_v1", {
      p_delivery_id: claim.deliveryId,
      p_lease_token: claim.leaseToken,
      p_outcome: delivery.outcome,
      p_provider_reference: delivery.providerReference || null,
      p_safe_error_class: delivery.safeErrorClass || null,
    });
    if (completion.error) throw new Error("workflow_email_completion_failed");
    if (delivery.outcome === "provider_accepted") providerAccepted += 1;
    else failed += 1;
  }

  return Object.freeze({ claimed, providerAccepted, failed });
}
