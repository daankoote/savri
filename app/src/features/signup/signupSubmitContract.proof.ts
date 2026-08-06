import { mapSignupDraftToSubmitPayload } from "./signupSubmitMapper";
import type { SignupDraft } from "./signupTypes";

export type SignupSubmitContractProofOptions = {
  endpointUrl: string;
  anonKey: string;
  idempotencyKey: string;
  runId?: string;
};

export type SignupSubmitContractProofResult = {
  ok: true;
  mode: "write_v3";
  validStatus: number;
  replayStatus: number;
  conflictStatus: number;
  customerId: string;
  dossierId: string;
  locationCount: number;
  chargerCount: number;
  documentSlotCount: number;
  legalAcceptanceCount: number;
  payloadHash: string;
};

type SignupSubmitWriteV3Response = {
  ok?: unknown;
  mode?: unknown;
  customer_id?: unknown;
  dossier_id?: unknown;
  location_count?: unknown;
  charger_count?: unknown;
  document_slot_count?: unknown;
  legal_acceptance_count?: unknown;
  payload_hash?: unknown;
  code?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NaN;
}

function changedPayloadEmail(runId: string): string {
  return `contract-conflict-${runId}@example.com`;
}

function authHeaders(anonKey: string, idempotencyKey: string) {
  return {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };
}

async function postJson(
  endpointUrl: string,
  anonKey: string,
  idempotencyKey: string,
  payload: unknown,
): Promise<{ status: number; body: SignupSubmitWriteV3Response }> {
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: authHeaders(anonKey, idempotencyKey),
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as SignupSubmitWriteV3Response;
  return { status: response.status, body };
}

export function createSignupSubmitContractProofDraft(
  runId = "local",
): SignupDraft {
  return {
    personalInfo: {
      accountType: "particulier",
      firstName: "Contract",
      lastName: "Proof",
      companyName: "",
      organizationName: "",
      kvkNumber: "",
      email: `contract-proof-${runId}@example.com`,
      phone: "",
      kvkDocument: null,
      address: {
        postcode: "2042PC",
        houseNumber: "65",
        suffix: "",
        street: "Kostverlorenstraat",
        city: "Zandvoort",
        country: "Nederland",
        bagId: `bag-contract-proof-${runId}`,
        resolvedLookupKey: "2042PC|65|",
      },
    },
    locations: [
      {
        clientId: `location-${runId}`,
        address: {
          postcode: "2042PC",
          houseNumber: "65",
          suffix: "",
          street: "Kostverlorenstraat",
          city: "Zandvoort",
          country: "Nederland",
          bagId: `bag-contract-proof-${runId}`,
          resolvedLookupKey: "2042PC|65|",
        },
        energyDocument: {
          clientId: `energy-location-${runId}`,
          locationClientId: `location-${runId}`,
          documentType: "energy_bill_or_contract",
          file: null,
          status: "empty",
        },
        energyDocumentObservation: null,
        connectionDeclaration: {
          sourceMode: "document",
          preflightStatus: "idle",
          candidates: [],
          selectedCandidateEan: "",
          confirmedEan: "",
          manualEan: "",
          customerConfirmed: false,
        },
        chargers: [
          {
            clientId: `charger-${runId}-1`,
            source: "manual",
            brand: "1",
            manualBrand: "",
            model: "1",
            manualModel: "",
            installationYear: "2024",
            midNumber: `MID-${runId}-1`,
            serialNumber: `SER-${runId}-1`,
            backendSupplier: "",
            manualBackendSupplier: "",
            solarPanelStatus: "none",
          },
          {
            clientId: `charger-${runId}-2`,
            source: "manual",
            brand: "1",
            manualBrand: "",
            model: "2",
            manualModel: "",
            installationYear: "2025",
            midNumber: `MID-${runId}-2`,
            serialNumber: `SER-${runId}-2`,
            backendSupplier: "",
            manualBackendSupplier: "",
            solarPanelStatus: "hourly_exportable",
          },
        ],
      },
    ],
    documentsByChargerId: {},
    consents: {
      termsBundleAccepted: true,
    },
  };
}

export function runSignupSubmitContractFixtureProof(): void {
  const payload = mapSignupDraftToSubmitPayload(
    createSignupSubmitContractProofDraft("journey-02"),
  );

  assert(payload.locations.length === 1, "fixture must map one location");
  assert(
    payload.locations[0].connectionDeclaration === undefined,
    "deferred fixture must omit connection declaration",
  );
  assert(
    payload.locations[0].chargers.length === 2,
    "fixture must preserve both chargers",
  );
  assert(
    payload.consentBundleAcceptance.accepted === true &&
      payload.feeTermsAcceptance.accepted === true,
    "fixture must preserve current general acceptances",
  );
}

export async function runSignupSubmitContractProof(
  options: SignupSubmitContractProofOptions,
): Promise<SignupSubmitContractProofResult> {
  const endpointUrl = options.endpointUrl.trim();
  const anonKey = options.anonKey.trim();
  const idempotencyKey = options.idempotencyKey.trim();
  const runId = options.runId?.trim() ||
    idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "-");

  assert(endpointUrl, "endpointUrl is required");
  assert(anonKey, "anonKey is required");
  assert(idempotencyKey, "idempotencyKey is required");

  const payload = mapSignupDraftToSubmitPayload(
    createSignupSubmitContractProofDraft(runId),
  );

  const valid = await postJson(endpointUrl, anonKey, idempotencyKey, payload);
  assert(
    valid.status === 200,
    `valid write_v3 request must return 200, got ${valid.status}`,
  );
  assert(
    valid.body.ok === true,
    "valid write_v3 response must include ok true",
  );
  assert(
    valid.body.mode === "write_v3",
    "valid response must include mode write_v3",
  );
  assert(
    stringValue(valid.body.customer_id),
    "valid response must include customer_id",
  );
  assert(
    stringValue(valid.body.dossier_id),
    "valid response must include dossier_id",
  );
  assert(
    numberValue(valid.body.location_count) === 1,
    "valid response must include location_count 1",
  );
  assert(
    numberValue(valid.body.charger_count) === 2,
    "valid response must include charger_count 2",
  );
  assert(
    numberValue(valid.body.document_slot_count) === 5,
    "valid response must include document_slot_count 5",
  );
  assert(
    numberValue(valid.body.legal_acceptance_count) === 2,
    "valid response must include legal_acceptance_count 2",
  );
  assert(
    stringValue(valid.body.payload_hash),
    "valid response must include payload_hash",
  );

  const replay = await postJson(endpointUrl, anonKey, idempotencyKey, payload);
  assert(
    replay.status === 200,
    `replay write_v3 request must return 200, got ${replay.status}`,
  );
  assert(
    replay.body.dossier_id === valid.body.dossier_id,
    "replay must return same dossier_id",
  );
  assert(
    replay.body.payload_hash === valid.body.payload_hash,
    "replay must return same payload_hash",
  );

  const conflictPayload = {
    ...payload,
    applicant: {
      ...payload.applicant,
      email: changedPayloadEmail(runId),
    },
  };
  const conflict = await postJson(
    endpointUrl,
    anonKey,
    idempotencyKey,
    conflictPayload,
  );
  assert(
    conflict.status === 409,
    `changed payload with same Idempotency-Key must return 409, got ${conflict.status}`,
  );
  assert(
    conflict.body.code === "idempotency_conflict",
    "conflict response must include idempotency_conflict",
  );

  return {
    ok: true,
    mode: "write_v3",
    validStatus: valid.status,
    replayStatus: replay.status,
    conflictStatus: conflict.status,
    customerId: stringValue(valid.body.customer_id),
    dossierId: stringValue(valid.body.dossier_id),
    locationCount: numberValue(valid.body.location_count),
    chargerCount: numberValue(valid.body.charger_count),
    documentSlotCount: numberValue(valid.body.document_slot_count),
    legalAcceptanceCount: numberValue(valid.body.legal_acceptance_count),
    payloadHash: stringValue(valid.body.payload_hash),
  };
}
