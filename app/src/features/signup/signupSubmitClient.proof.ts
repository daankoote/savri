import { submitSignupPayload } from "./signupSubmitClient";
import type { SignupSubmitPayloadV3 } from "./signupSubmitMapper";

export type SignupSubmitClientProofResult = {
  ok: true;
  successValidated: true;
  headersVerified: true;
  bodyVerified: true;
  conflictMapped: true;
  invalidResponseMapped: true;
};

type MockFetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function proofPayload(): SignupSubmitPayloadV3 {
  return {
    accountType: "particulier",
    applicant: {
      firstName: "Client",
      lastName: "Proof",
      email: "client-proof@example.com",
      address: {
        postcode: "2042PC",
        houseNumber: "65",
        street: "Kostverlorenstraat",
        city: "Zandvoort",
        country: "Nederland",
      },
    },
    consentBundleAcceptance: {
      accepted: true,
      versionRef: "signup-consent-v1",
    },
    feeTermsAcceptance: {
      accepted: true,
      versionRef: "fee-terms-v1",
    },
    locations: [
      {
        clientLocationId: "location-client-proof",
        address: {
          postcode: "2042PC",
          houseNumber: "65",
          street: "Kostverlorenstraat",
          city: "Zandvoort",
          country: "Nederland",
        },
        chargers: [
          {
            clientChargerId: "charger-client-proof-1",
            brand: "1",
            brandLabel: "Alfen",
            model: "1",
            modelLabel: "Eve Single Pro Line",
            midNumber: "MID-CLIENT-PROOF-1",
            serialNumber: "SER-CLIENT-PROOF-1",
          },
        ],
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createMockFetch(responses: Response[]) {
  const calls: MockFetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const response = responses.shift();
    if (!response) throw new Error("Missing mock response");
    return response;
  }) as typeof fetch;

  return { calls, fetchImpl };
}

function getHeader(init: RequestInit | undefined, key: string): string {
  const headers = init?.headers;
  if (!headers) return "";

  if (headers instanceof Headers) return headers.get(key) || "";
  if (Array.isArray(headers)) {
    return headers.find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1] || "";
  }

  return String((headers as Record<string, string>)[key] || "");
}

export async function runSignupSubmitClientProof(): Promise<SignupSubmitClientProofResult> {
  const payload = proofPayload();
  const endpointUrl = "http://localhost:54321/functions/v1/api-app-signup-submit";
  const anonKey = "local-proof-key";
  const idempotencyKey = "client-proof-idempotency-key";
  const successBody = {
    ok: true,
    mode: "write_v3",
    request_id: "request-client-proof",
    customer_id: "customer-client-proof",
    dossier_id: "dossier-client-proof",
    location_count: 1,
    charger_count: 1,
    document_slot_count: 3,
    legal_acceptance_count: 2,
    payload_hash: "a".repeat(64),
    message:
      "Foundation submit geaccepteerd; dossier shell, locaties, laadpalen, document-slots en juridische acceptaties zijn aangemaakt. Uploadverwerking is nog niet geimplementeerd.",
  };
  const { calls, fetchImpl } = createMockFetch([
    jsonResponse(successBody),
    jsonResponse({ ok: false, code: "idempotency_conflict", error: "Conflict" }, 409),
    jsonResponse({ ok: true, mode: "write_v3" }),
  ]);

  const success = await submitSignupPayload(payload, {
    endpointUrl,
    anonKey,
    idempotencyKey,
    fetchImpl,
  });

  assert(success.ok === true, "success response must validate");
  assert(success.mode === "write_v3", "success mode must be write_v3");
  assert(success.document_slot_count === 3, "success document_slot_count must validate");
  assert(success.legal_acceptance_count === 2, "success legal_acceptance_count must validate");

  const firstCall = calls[0];
  assert(firstCall.input === endpointUrl, "endpoint URL must be used");
  assert(firstCall.init?.method === "POST", "POST method must be used");
  assert(getHeader(firstCall.init, "Authorization") === `Bearer ${anonKey}`, "Authorization header must be set");
  assert(getHeader(firstCall.init, "apikey") === anonKey, "apikey header must be set");
  assert(getHeader(firstCall.init, "Content-Type") === "application/json", "Content-Type header must be set");
  assert(getHeader(firstCall.init, "Idempotency-Key") === idempotencyKey, "Idempotency-Key header must be set");
  assert(JSON.stringify(JSON.parse(String(firstCall.init?.body))) === JSON.stringify(payload), "body must equal mapped payload");

  const conflict = await submitSignupPayload(payload, {
    endpointUrl,
    anonKey,
    idempotencyKey,
    fetchImpl,
  });

  assert(conflict.ok === false, "conflict result must be an error");
  assert(conflict.code === "idempotency_conflict", "idempotency_conflict must be typed");
  assert(conflict.status === 409, "idempotency_conflict status must be 409");

  const invalid = await submitSignupPayload(payload, {
    endpointUrl,
    anonKey,
    idempotencyKey,
    fetchImpl,
  });

  assert(invalid.ok === false, "invalid response result must be an error");
  assert(invalid.code === "invalid_response", "invalid response must be typed");

  return {
    ok: true,
    successValidated: true,
    headersVerified: true,
    bodyVerified: true,
    conflictMapped: true,
    invalidResponseMapped: true,
  };
}
