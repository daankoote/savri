import {
  runWorkflowEmailWorker,
  type WorkflowEmailWorkerClient,
} from "../../supabase/functions/_shared/workflow_email_worker.ts";
import {
  LocalMailpitWorkflowEmailTransportAdapter,
  resolveWorkflowEmailTransport,
  type WorkflowEmailTransportPort,
} from "../../supabase/functions/_shared/workflow_email_transport.ts";

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

function claim(index: number) {
  return {
    ok: true,
    delivery: {
      attempt_number: 1,
      body: `body-${index}`,
      delivery_id: `10000000-0000-4000-8000-00000000000${index}`,
      lease_token: `20000000-0000-4000-8000-00000000000${index}`,
      provider_idempotency_key: `workflow-email-v1:${"a".repeat(64)}`,
      recipient_email: "customer@example.invalid",
      subject: "Er staat een vraag voor u klaar",
      template_key: "information-request-created-customer-nl-v1",
    },
  };
}

async function readUntil(connection: Deno.Conn, marker: string): Promise<void> {
  const byte = new Uint8Array(1);
  let tail = "";
  while (!tail.endsWith(marker)) {
    const count = await connection.read(byte);
    if (count === null) throw new Error("smtp_fixture_connection_closed");
    tail = `${tail}${String.fromCharCode(byte[0])}`.slice(-marker.length);
  }
}

async function writeReply(connection: Deno.Conn, reply: string): Promise<void> {
  await connection.write(new TextEncoder().encode(`${reply}\r\n`));
}

function startSmtpCommitPointFixture(
  mode: "close_during_data_reply" | "close_during_quit_reply",
): { port: number; finished: Promise<void> } {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  const finished = (async () => {
    const connection = await listener.accept();
    try {
      await writeReply(connection, "220 fixture");
      await readUntil(connection, "\r\n");
      await writeReply(connection, "250 fixture");
      await readUntil(connection, "\r\n");
      await writeReply(connection, "250 fixture");
      await readUntil(connection, "\r\n");
      await writeReply(connection, "250 fixture");
      await readUntil(connection, "\r\n");
      await writeReply(connection, "354 fixture");
      await readUntil(connection, "\r\n.\r\n");
      if (mode === "close_during_data_reply") return;
      await writeReply(connection, "250 accepted");
      await readUntil(connection, "\r\n");
      // Deliberately close without a QUIT reply after DATA was accepted.
    } finally {
      connection.close();
      listener.close();
    }
  })();
  return { port, finished };
}

const completions: Record<string, unknown>[] = [];
const claims: unknown[] = [claim(1), claim(2), { ok: true, delivery: null }];
const client: WorkflowEmailWorkerClient = {
  async rpc(name, args) {
    if (name === "app_workflow_email_claim_v1") {
      return { data: claims.shift(), error: null };
    }
    assert(name === "app_workflow_email_complete_v1", "unexpected_rpc");
    completions.push(args || {});
    return { data: { ok: true }, error: null };
  },
};
const deliveredBodies: string[] = [];
const transport: WorkflowEmailTransportPort = {
  transportId: "local_mailpit_v1",
  async deliver(request) {
    deliveredBodies.push(request.body);
    return {
      outcome: "provider_accepted",
      providerReference: `mailpit:${"b".repeat(64)}`,
    };
  },
};

const result = await runWorkflowEmailWorker(client, transport);
assert(
  result.claimed === 2 && result.providerAccepted === 2 && result.failed === 0,
  "worker_batch_result_invalid",
);
assert(
  deliveredBodies.join("|") === "body-1|body-2" &&
    completions.length === 2 &&
    completions.every((entry) => entry.p_outcome === "provider_accepted"),
  "worker_delivery_or_completion_invalid",
);

const throwingClient: WorkflowEmailWorkerClient = {
  async rpc(name, args) {
    if (name === "app_workflow_email_claim_v1") {
      return { data: claim(3), error: null };
    }
    assert(args?.p_outcome === "ambiguous_failure", "throw_not_ambiguous");
    assert(
      args?.p_safe_error_class === "provider_ambiguous",
      "throw_error_not_minimized",
    );
    return { data: { ok: true }, error: null };
  },
} as WorkflowEmailWorkerClient;
let throwingClaims = 0;
const boundedThrowingClient: WorkflowEmailWorkerClient = {
  async rpc(name, args) {
    if (name === "app_workflow_email_claim_v1") {
      throwingClaims += 1;
      return {
        data: throwingClaims === 1 ? claim(3) : { ok: true, delivery: null },
        error: null,
      };
    }
    return await throwingClient.rpc(name, args);
  },
};
const thrown = await runWorkflowEmailWorker(boundedThrowingClient, {
  transportId: "local_mailpit_v1",
  deliver() {
    throw new Error("raw provider detail must not escape");
  },
});
assert(thrown.failed === 1 && thrown.claimed === 1, "ambiguous_count_invalid");

let malformedRejected = false;
try {
  await runWorkflowEmailWorker(
    {
      rpc() {
        return Promise.resolve({
          data: {
            ...claim(4),
            delivery: { ...claim(4).delivery, unexpected: "field" },
          },
          error: null,
        });
      },
    },
    transport,
    1,
  );
} catch (error) {
  malformedRejected = error instanceof Error &&
    error.message === "workflow_email_claim_contract_invalid";
}
assert(malformedRejected, "malformed_claim_not_rejected");

const deliveryRequest = {
  recipientEmail: "customer@example.invalid",
  subject: "Er staat een vraag voor u klaar",
  body: "Beste klant,\n\nDit is een transporttest.",
  providerIdempotencyKey: `workflow-email-v1:${"c".repeat(64)}`,
};
const uncertainSmtp = startSmtpCommitPointFixture("close_during_data_reply");
const uncertainResult = await new LocalMailpitWorkflowEmailTransportAdapter(
  "127.0.0.1",
  uncertainSmtp.port,
  "noreply@enval.local",
).deliver(deliveryRequest);
await uncertainSmtp.finished;
assert(
  uncertainResult.outcome === "ambiguous_failure" &&
    uncertainResult.safeErrorClass === "provider_ambiguous",
  "uncertain_data_acceptance_not_ambiguous",
);

const acceptedSmtp = startSmtpCommitPointFixture("close_during_quit_reply");
const acceptedResult = await new LocalMailpitWorkflowEmailTransportAdapter(
  "127.0.0.1",
  acceptedSmtp.port,
  "noreply@enval.local",
).deliver(deliveryRequest);
await acceptedSmtp.finished;
assert(
  acceptedResult.outcome === "provider_accepted",
  "quit_failure_reclassified_accepted_delivery",
);

const environment = (values: Record<string, string>) => ({
  get: (name: string) => values[name],
});
assert(
  resolveWorkflowEmailTransport(environment({
    SUPABASE_URL: "http://127.0.0.1:54321",
  }))?.transportId === "local_mailpit_v1",
  "local_transport_not_selected",
);
assert(
  resolveWorkflowEmailTransport(environment({
    SUPABASE_URL: "https://example.supabase.co",
  })) === null,
  "hosted_transport_not_disabled",
);

console.log("WORKFLOW_EMAIL_WORKER_Q01_Q10=PASS");
