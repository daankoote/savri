// supabase/functions/api-app-signup-submit/index.ts
//
// Atomic write-v3 boundary for the /app signup submit endpoint.
// Frontend may assist; backend decides.
//
// All business, audit and idempotency writes are owned by
// app_submit_signup_v4 in one database transaction.

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";

type SignupSubmitPayload = {
  accountType?: unknown;
  applicant?: unknown;
  legalEntity?: unknown;
  primaryAddress?: unknown;
  address?: unknown;
  consentBundleAcceptance?: unknown;
  feeTermsAcceptance?: unknown;
  privacyTermsAcceptance?: unknown;
  serviceTermsAcceptance?: unknown;
  mandateAuthorizationAcceptance?: unknown;
  locations?: unknown;
  chargers?: unknown;
};

const ACCOUNT_TYPES = new Set(["particulier", "zakelijk", "vve"]);
const IDEMPOTENCY_SCOPE = "api-app-signup-submit:v3";
const IDEMPOTENCY_TTL_HOURS = 24;

const LEGAL_ACCEPTANCE_SPECS = [
  {
    payloadKey: "consentBundleAcceptance",
    acceptance_type: "consent_bundle",
    defaultVersionRef: "signup-consent-v1",
    required: true,
  },
  {
    payloadKey: "feeTermsAcceptance",
    acceptance_type: "fee_terms",
    defaultVersionRef: "fee-terms-v1",
    required: true,
  },
  {
    payloadKey: "privacyTermsAcceptance",
    acceptance_type: "privacy_terms",
    defaultVersionRef: "privacy-terms-v1",
    required: false,
  },
  {
    payloadKey: "serviceTermsAcceptance",
    acceptance_type: "service_terms",
    defaultVersionRef: "service-terms-v1",
    required: false,
  },
  {
    payloadKey: "mandateAuthorizationAcceptance",
    acceptance_type: "mandate_authorization",
    defaultVersionRef: "mandate-authorization-v1",
    required: false,
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getNestedRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getNumberString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return getString(value);
}

function pickValue(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  return getString(pickValue(source, keys));
}

function pickNumberString(
  source: Record<string, unknown>,
  keys: string[],
): string {
  return getNumberString(pickValue(source, keys));
}

function normalizePostcode(value: unknown): string {
  return getString(value).toUpperCase().replace(/\s+/g, "");
}

function normalizeSuffix(value: unknown): string | null {
  const normalized = getString(value).toUpperCase().replace(/\s+/g, "");
  return normalized || null;
}

function normalizeEmail(value: unknown): string {
  return getString(value).toLowerCase();
}

function appSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

type NormalizedLocation = {
  client_location_id: string;
  label: string | null;
  postcode_normalized: string;
  house_number: string;
  suffix_normalized: string | null;
  street: string | null;
  city: string | null;
  country: string;
  lookup_provider: string | null;
  lookup_provider_id: string | null;
  lookup_metadata: Record<string, unknown>;
  chargers: NormalizedCharger[];
};

type NormalizedCharger = {
  client_charger_id: string;
  brand_id: string | null;
  brand_label: string | null;
  manual_brand: string | null;
  model_id: string | null;
  model_label: string | null;
  manual_model: string | null;
  serial_number: string | null;
  mid_number: string;
  backend_supplier_id: string | null;
  backend_supplier_label: string | null;
  manual_backend_supplier: string | null;
  installation_year: number | null;
  solar_export_status: string | null;
};

type NormalizationResult =
  | {
    ok: true;
    locations: NormalizedLocation[];
    location_count: number;
    charger_count: number;
  }
  | { ok: false; message: string };

type LegalAcceptanceRow = {
  acceptance_type: string;
  version_ref: string;
  version_hash: string | null;
};

type SignupDeclaration = {
  declaration_kind: "natural_person" | "organization";
  person_first_name: string | null;
  person_last_name: string | null;
  person_full_name: string | null;
  organization_classification: "business" | "vve" | null;
  organization_legal_name: string | null;
  trade_register_number: string | null;
};

type AtomicSignupRpcResult = {
  ok?: unknown;
  status?: unknown;
  replayed?: unknown;
  code?: unknown;
  message?: unknown;
  body?: unknown;
};

export type SignupSubmitDependencies = {
  createServiceClient?: () => any;
  now?: () => Date;
};

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function catalogValueLabel(
  source: Record<string, unknown>,
  valueKeys: string[],
  labelKeys: string[],
): { value: string | null; label: string | null } {
  const rawValue = pickValue(source, valueKeys);
  if (isRecord(rawValue)) {
    const value = pickString(rawValue, ["value", "id", "key"]);
    const label = pickString(rawValue, ["label", "name", "title"]);
    return { value: value || null, label: label || value || null };
  }

  const value = getString(rawValue);
  const label = pickString(source, labelKeys);
  return {
    value: value || null,
    label: label || value || null,
  };
}

function optionalString(value: unknown): string | null {
  const s = getString(value);
  return s || null;
}

function parseInstallationYear(
  value: unknown,
): { ok: true; value: number | null } | { ok: false } {
  const raw = getNumberString(value);
  if (!raw) return { ok: true, value: null };
  if (!/^\d{4}$/.test(raw)) return { ok: false };

  const year = Number(raw);
  if (year < 1990 || year > 2050) return { ok: false };
  return { ok: true, value: year };
}

function minimizedLookupMetadata(
  address: Record<string, unknown>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  const normalizedLookupKey = pickString(address, [
    "normalizedLookupKey",
    "normalized_lookup_key",
    "lookupKey",
    "lookup_key",
  ]);
  const resolvedAt = pickString(address, [
    "lookupResolvedAt",
    "lookup_resolved_at",
    "resolvedAt",
    "resolved_at",
  ]);

  if (normalizedLookupKey) metadata.normalized_lookup_key = normalizedLookupKey;
  if (resolvedAt) metadata.resolved_at = resolvedAt;

  return metadata;
}

function normalizeCharger(
  rawCharger: Record<string, unknown>,
  locationIndex: number,
  chargerIndex: number,
): { ok: true; charger: NormalizedCharger } | { ok: false; message: string } {
  const client_charger_id = pickString(rawCharger, [
    "clientChargerId",
    "client_charger_id",
    "clientId",
    "client_id",
  ]) ||
    `charger-${locationIndex + 1}-${chargerIndex + 1}`;

  const mid_number = pickString(rawCharger, ["midNumber", "mid_number", "mid"]);
  if (!mid_number) {
    return {
      ok: false,
      message: "Controleer het MID nummer van iedere laadpaal.",
    };
  }

  const installationYear = parseInstallationYear(
    pickValue(rawCharger, ["installationYear", "installation_year"]),
  );
  if (!installationYear.ok) {
    return {
      ok: false,
      message: "Controleer het installatiejaar van iedere laadpaal.",
    };
  }

  const brand = catalogValueLabel(
    rawCharger,
    ["brand_id", "brandId", "brand"],
    [
      "brand_label",
      "brandLabel",
    ],
  );
  const model = catalogValueLabel(
    rawCharger,
    ["model_id", "modelId", "model"],
    [
      "model_label",
      "modelLabel",
    ],
  );
  const backendSupplier = catalogValueLabel(
    rawCharger,
    ["backend_supplier_id", "backendSupplier", "backendSupplierId"],
    ["backend_supplier_label", "backendSupplierLabel"],
  );

  return {
    ok: true,
    charger: {
      client_charger_id,
      brand_id: brand.value,
      brand_label: brand.label,
      manual_brand: optionalString(
        pickValue(rawCharger, ["manualBrand", "manual_brand"]),
      ),
      model_id: model.value,
      model_label: model.label,
      manual_model: optionalString(
        pickValue(rawCharger, ["manualModel", "manual_model"]),
      ),
      serial_number: optionalString(
        pickValue(rawCharger, ["serialNumber", "serial_number"]),
      ),
      mid_number,
      backend_supplier_id: backendSupplier.value,
      backend_supplier_label: backendSupplier.label,
      manual_backend_supplier: optionalString(
        pickValue(rawCharger, [
          "manualBackendSupplier",
          "manual_backend_supplier",
        ]),
      ),
      installation_year: installationYear.value,
      solar_export_status: optionalString(
        pickValue(rawCharger, ["solarPanelStatus", "solar_export_status"]),
      ),
    },
  };
}

function normalizeLocation(
  rawLocation: Record<string, unknown>,
  rawChargers: Record<string, unknown>[],
  locationIndex: number,
): { ok: true; location: NormalizedLocation } | { ok: false; message: string } {
  const address = isRecord(rawLocation.address)
    ? rawLocation.address
    : rawLocation;
  const client_location_id = pickString(rawLocation, [
    "clientLocationId",
    "client_location_id",
    "clientId",
    "client_id",
  ]) ||
    `location-${locationIndex + 1}`;

  const postcode_normalized = normalizePostcode(
    pickValue(address, ["postcode", "postalCode", "postal_code"]),
  );
  const house_number = pickNumberString(address, [
    "houseNumber",
    "house_number",
    "housenumber",
    "number",
  ]);

  if (!postcode_normalized || !house_number) {
    return {
      ok: false,
      message: "Controleer postcode en huisnummer van iedere locatie.",
    };
  }

  const chargers: NormalizedCharger[] = [];
  const chargerIds = new Set<string>();
  for (let i = 0; i < rawChargers.length; i += 1) {
    const normalized = normalizeCharger(rawChargers[i], locationIndex, i);
    if (!normalized.ok) return normalized;
    if (chargerIds.has(normalized.charger.client_charger_id)) {
      return { ok: false, message: "Controleer dubbele laadpaalreferenties." };
    }
    chargerIds.add(normalized.charger.client_charger_id);
    chargers.push(normalized.charger);
  }

  return {
    ok: true,
    location: {
      client_location_id,
      label: optionalString(pickValue(rawLocation, ["label", "name", "title"])),
      postcode_normalized,
      house_number,
      suffix_normalized: normalizeSuffix(
        pickValue(address, ["suffix", "house_suffix", "addition"]),
      ),
      street: optionalString(
        pickValue(address, ["street", "adres", "addressLine", "address_line"]),
      ),
      city: optionalString(pickValue(address, ["city", "stad"])),
      country: getString(pickValue(address, ["country", "land"])) ||
        "Nederland",
      lookup_provider: optionalString(
        pickValue(address, ["lookupProvider", "lookup_provider"]),
      ),
      lookup_provider_id: optionalString(
        pickValue(address, [
          "lookupProviderId",
          "lookup_provider_id",
          "bagId",
          "bag_id",
        ]),
      ),
      lookup_metadata: minimizedLookupMetadata(address),
      chargers,
    },
  };
}

function normalizeLocationsAndChargers(
  body: SignupSubmitPayload,
): NormalizationResult {
  const rawLocations = asRecordArray(body.locations);
  const topLevelChargers = asRecordArray(body.chargers);
  const normalizedLocations: NormalizedLocation[] = [];
  const locationIds = new Set<string>();

  if (rawLocations.length) {
    for (let i = 0; i < rawLocations.length; i += 1) {
      const rawLocation = rawLocations[i];
      const normalized = normalizeLocation(
        rawLocation,
        asRecordArray(rawLocation.chargers),
        i,
      );
      if (!normalized.ok) return normalized;
      if (locationIds.has(normalized.location.client_location_id)) {
        return { ok: false, message: "Controleer dubbele locatiereferenties." };
      }
      locationIds.add(normalized.location.client_location_id);
      normalizedLocations.push(normalized.location);
    }
  } else if (topLevelChargers.length) {
    const applicant = isRecord(body.applicant) ? body.applicant : {};
    const defaultAddress = isRecord(body.primaryAddress)
      ? body.primaryAddress
      : isRecord(body.address)
      ? body.address
      : isRecord(applicant.address)
      ? applicant.address
      : null;

    if (!defaultAddress) {
      return { ok: false, message: "Controleer de locatiegegevens." };
    }

    const normalized = normalizeLocation(
      { client_location_id: "location-1", address: defaultAddress },
      topLevelChargers,
      0,
    );
    if (!normalized.ok) return normalized;
    normalizedLocations.push(normalized.location);
  }

  const charger_count = normalizedLocations.reduce(
    (sum, location) => sum + location.chargers.length,
    0,
  );

  if (!normalizedLocations.length || charger_count < 1) {
    return {
      ok: false,
      message: "Controleer de laadpaal- of locatiegegevens.",
    };
  }

  const globalChargerIds = new Set<string>();
  for (const location of normalizedLocations) {
    for (const charger of location.chargers) {
      const key = charger.client_charger_id;
      if (globalChargerIds.has(key)) {
        return {
          ok: false,
          message: "Controleer dubbele laadpaalreferenties.",
        };
      }
      globalChargerIds.add(key);
    }
  }

  return {
    ok: true,
    locations: normalizedLocations,
    location_count: normalizedLocations.length,
    charger_count,
  };
}

function isHexSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function acceptanceVersionRef(
  acceptance: Record<string, unknown>,
  fallback: string,
): string {
  return pickString(acceptance, ["versionRef", "version_ref", "version"]) ||
    fallback;
}

function acceptanceVersionHash(
  acceptance: Record<string, unknown>,
): string | null {
  const hash = pickString(acceptance, ["versionHash", "version_hash"]);
  return hash && isHexSha256(hash) ? hash.toLowerCase() : null;
}

function buildLegalAcceptanceRows(
  body: SignupSubmitPayload,
) {
  const rows: LegalAcceptanceRow[] = [];

  for (const spec of LEGAL_ACCEPTANCE_SPECS) {
    const acceptance = getNestedRecord(body, spec.payloadKey);
    if (!acceptance || acceptance.accepted !== true) continue;

    rows.push({
      acceptance_type: spec.acceptance_type,
      version_ref: acceptanceVersionRef(acceptance, spec.defaultVersionRef),
      version_hash: acceptanceVersionHash(acceptance),
    });
  }

  return rows;
}

async function parseJsonBody(
  req: Request,
): Promise<{ ok: true; body: SignupSubmitPayload } | { ok: false }> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false };
    return { ok: true, body: body as SignupSubmitPayload };
  } catch (_e) {
    return { ok: false };
  }
}

function validateSubmitContract(body: SignupSubmitPayload): string | null {
  const accountType = getString(body.accountType);
  if (!ACCOUNT_TYPES.has(accountType)) {
    return "Controleer het type aanmelding.";
  }

  if (!isRecord(body.applicant)) {
    return "Controleer de aanvragergegevens.";
  }

  const email = getString(body.applicant.email);
  if (!email) {
    return "Controleer het e-mailadres.";
  }

  if (accountType === "particulier") {
    const firstName = getString(body.applicant.firstName);
    const lastName = getString(body.applicant.lastName);
    if (!firstName || !lastName) {
      return "Controleer de voor- en achternaam.";
    }
  } else {
    const legalEntity = isRecord(body.legalEntity) ? body.legalEntity : null;
    const expectedType = accountType === "zakelijk" ? "business" : "vve";
    if (
      !legalEntity ||
      getString(legalEntity.type) !== expectedType ||
      !getString(legalEntity.name) ||
      !/^\d{8}$/.test(getString(legalEntity.kvkNumber))
    ) {
      return "Controleer de organisatiegegevens en het KvK-nummer.";
    }
  }

  const consentBundleAcceptance = getNestedRecord(
    body,
    "consentBundleAcceptance",
  );
  if (consentBundleAcceptance?.accepted !== true) {
    return "Bevestig toestemming en voorwaarden.";
  }

  const feeTermsAcceptance = getNestedRecord(body, "feeTermsAcceptance");
  if (feeTermsAcceptance?.accepted !== true) {
    return "Bevestig de ENVAL feevoorwaarden.";
  }

  if (!Array.isArray(body.locations) && !Array.isArray(body.chargers)) {
    return "Controleer de laadpaal- of locatiegegevens.";
  }

  return null;
}

function buildDeclaration(
  body: SignupSubmitPayload,
  accountType: "particulier" | "zakelijk" | "vve",
): SignupDeclaration {
  if (accountType === "particulier") {
    const applicant = body.applicant as Record<string, unknown>;
    const person_first_name = getString(applicant.firstName);
    const person_last_name = getString(applicant.lastName);
    return {
      declaration_kind: "natural_person",
      person_first_name,
      person_last_name,
      person_full_name: `${person_first_name} ${person_last_name}`,
      organization_classification: null,
      organization_legal_name: null,
      trade_register_number: null,
    };
  }

  const legalEntity = body.legalEntity as Record<string, unknown>;
  return {
    declaration_kind: "organization",
    person_first_name: null,
    person_last_name: null,
    person_full_name: null,
    organization_classification: accountType === "zakelijk"
      ? "business"
      : "vve",
    organization_legal_name: getString(legalEntity.name),
    trade_register_number: getString(legalEntity.kvkNumber),
  };
}

function isAtomicSignupRpcResult(
  value: unknown,
): value is AtomicSignupRpcResult {
  return isRecord(value) &&
    typeof value.ok === "boolean" &&
    typeof value.status === "number";
}

export async function handleSignupSubmit(
  req: Request,
  dependencies: SignupSubmitDependencies = {},
): Promise<Response> {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);

  if (req.method !== "POST") {
    return appErrorResponse(
      req,
      405,
      "Methode niet toegestaan.",
      "method_not_allowed",
    );
  }

  if (!meta.idempotency_key) {
    return appErrorResponse(
      req,
      400,
      "Idempotency-Key ontbreekt.",
      "missing_idempotency_key",
    );
  }

  const SB = (dependencies.createServiceClient || appSupabaseClient)();
  if (!SB) {
    return appErrorResponse(
      req,
      500,
      "Aanmelding tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return appErrorResponse(
      req,
      400,
      "Controleer de aanvraag.",
      "invalid_json",
    );
  }

  const payload_hash = await payloadHash(parsed.body);

  const validationError = validateSubmitContract(parsed.body);
  if (validationError) {
    return appErrorResponse(
      req,
      400,
      validationError,
      "invalid_signup_contract",
    );
  }

  const normalizedSubmit = normalizeLocationsAndChargers(parsed.body);
  if (!normalizedSubmit.ok) {
    return appErrorResponse(
      req,
      400,
      normalizedSubmit.message,
      "invalid_signup_contract",
    );
  }

  const accountType = getString(parsed.body.accountType) as
    | "particulier"
    | "zakelijk"
    | "vve";
  const applicant = parsed.body.applicant as Record<string, unknown>;
  const email_normalized = normalizeEmail(applicant.email);
  const declaration = buildDeclaration(parsed.body, accountType);
  const display_name = declaration.person_full_name ||
    declaration.organization_legal_name ||
    "";
  const legal_acceptances = buildLegalAcceptanceRows(parsed.body);
  const now = dependencies.now?.() || new Date();

  const { data, error } = await SB.rpc("app_submit_signup_v4", {
    p_request: {
      request_id: meta.request_id,
      idempotency_scope: IDEMPOTENCY_SCOPE,
      idempotency_key: meta.idempotency_key,
      payload_hash,
      idempotency_expires_at: new Date(
        now.getTime() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000,
      ).toISOString(),
      actor_ref: "api-app-signup-submit",
      environment: meta.environment,
      ip_hash: meta.ip_hash,
      user_agent_hash: meta.user_agent_hash,
      account_type: accountType,
      email_normalized,
      display_name,
      declaration,
      locations: normalizedSubmit.locations,
      legal_acceptances,
    },
  });

  if (error || !isAtomicSignupRpcResult(data)) {
    return appErrorResponse(
      req,
      500,
      "Aanmelding tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }

  if (data.ok !== true) {
    const status = Number(data.status);
    const code = getString(data.code) || "request_failed";
    const message = getString(data.message) ||
      "Aanmelding tijdelijk niet beschikbaar.";
    return appErrorResponse(
      req,
      status >= 400 && status <= 599 ? status : 500,
      message,
      code,
    );
  }

  if (!isRecord(data.body)) {
    return appErrorResponse(
      req,
      500,
      "Aanmelding tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }

  return appJsonResponse(req, Number(data.status), data.body);
}

if (import.meta.main) {
  serve((req) => handleSignupSubmit(req));
}
