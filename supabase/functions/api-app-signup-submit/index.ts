// supabase/functions/api-app-signup-submit/index.ts
//
// DB-write v3 foundation for the future /app signup submit endpoint.
// Frontend may assist; backend decides.
//
// Foundation migration must be applied/tested before enabling production writes.
// This endpoint is not yet wired from /app.

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  insertAppAuditFailOpen,
  insertAppIntakeAuditFailOpen,
  payloadHash,
} from "../_shared/app_foundation.ts";

type SignupSubmitPayload = {
  accountType?: unknown;
  applicant?: unknown;
  primaryAddress?: unknown;
  address?: unknown;
  consentBundleAcceptance?: unknown;
  feeTermsAcceptance?: unknown;
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

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getNumberString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
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

function pickNumberString(source: Record<string, unknown>, keys: string[]): string {
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

function displayNameFromApplicant(applicant: Record<string, unknown>, email: string): string {
  const firstName = getString(applicant.firstName ?? applicant.first_name ?? applicant.voornaam);
  const lastName = getString(applicant.lastName ?? applicant.last_name ?? applicant.achternaam);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  const prefix = email.split("@")[0]?.trim();
  return prefix || email;
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
  | { ok: true; locations: NormalizedLocation[]; location_count: number; charger_count: number }
  | { ok: false; message: string };

type InsertedChargerRef = {
  id: string;
  location_id: string;
  client_charger_id: string;
};

type DocumentSlotRow = {
  dossier_id: string;
  location_id: string | null;
  charger_id: string | null;
  client_slot_id: string;
  document_type: string;
  status: "expected";
  required: boolean;
  title: string;
  metadata: Record<string, unknown>;
};

type LegalAcceptanceRow = {
  dossier_id: string;
  customer_id: string;
  acceptance_type: string;
  status: "accepted";
  version_ref: string;
  version_hash: string | null;
  actor_type: "customer";
  actor_ref: string;
  ip_hash: string | null;
  user_agent_hash: string | null;
  evidence_data: Record<string, unknown>;
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

function parseInstallationYear(value: unknown): { ok: true; value: number | null } | { ok: false } {
  const raw = getNumberString(value);
  if (!raw) return { ok: true, value: null };
  if (!/^\d{4}$/.test(raw)) return { ok: false };

  const year = Number(raw);
  if (year < 1990 || year > 2050) return { ok: false };
  return { ok: true, value: year };
}

function minimizedLookupMetadata(address: Record<string, unknown>): Record<string, unknown> {
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
  const client_charger_id =
    pickString(rawCharger, ["clientChargerId", "client_charger_id", "clientId", "client_id"]) ||
    `charger-${locationIndex + 1}-${chargerIndex + 1}`;

  const mid_number = pickString(rawCharger, ["midNumber", "mid_number", "mid"]);
  if (!mid_number) {
    return { ok: false, message: "Controleer het MID nummer van iedere laadpaal." };
  }

  const installationYear = parseInstallationYear(
    pickValue(rawCharger, ["installationYear", "installation_year"]),
  );
  if (!installationYear.ok) {
    return { ok: false, message: "Controleer het installatiejaar van iedere laadpaal." };
  }

  const brand = catalogValueLabel(rawCharger, ["brand_id", "brandId", "brand"], [
    "brand_label",
    "brandLabel",
  ]);
  const model = catalogValueLabel(rawCharger, ["model_id", "modelId", "model"], [
    "model_label",
    "modelLabel",
  ]);
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
      manual_brand: optionalString(pickValue(rawCharger, ["manualBrand", "manual_brand"])),
      model_id: model.value,
      model_label: model.label,
      manual_model: optionalString(pickValue(rawCharger, ["manualModel", "manual_model"])),
      serial_number: optionalString(pickValue(rawCharger, ["serialNumber", "serial_number"])),
      mid_number,
      backend_supplier_id: backendSupplier.value,
      backend_supplier_label: backendSupplier.label,
      manual_backend_supplier: optionalString(
        pickValue(rawCharger, ["manualBackendSupplier", "manual_backend_supplier"]),
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
  const address = isRecord(rawLocation.address) ? rawLocation.address : rawLocation;
  const client_location_id =
    pickString(rawLocation, ["clientLocationId", "client_location_id", "clientId", "client_id"]) ||
    `location-${locationIndex + 1}`;

  const postcode_normalized = normalizePostcode(pickValue(address, ["postcode", "postalCode", "postal_code"]));
  const house_number = pickNumberString(address, ["houseNumber", "house_number", "housenumber", "number"]);

  if (!postcode_normalized || !house_number) {
    return { ok: false, message: "Controleer postcode en huisnummer van iedere locatie." };
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
      suffix_normalized: normalizeSuffix(pickValue(address, ["suffix", "house_suffix", "addition"])),
      street: optionalString(pickValue(address, ["street", "adres", "addressLine", "address_line"])),
      city: optionalString(pickValue(address, ["city", "stad"])),
      country: getString(pickValue(address, ["country", "land"])) || "Nederland",
      lookup_provider: optionalString(pickValue(address, ["lookupProvider", "lookup_provider"])),
      lookup_provider_id: optionalString(
        pickValue(address, ["lookupProviderId", "lookup_provider_id", "bagId", "bag_id"]),
      ),
      lookup_metadata: minimizedLookupMetadata(address),
      chargers,
    },
  };
}

function normalizeLocationsAndChargers(body: SignupSubmitPayload): NormalizationResult {
  const rawLocations = asRecordArray(body.locations);
  const topLevelChargers = asRecordArray(body.chargers);
  const normalizedLocations: NormalizedLocation[] = [];
  const locationIds = new Set<string>();

  if (rawLocations.length) {
    for (let i = 0; i < rawLocations.length; i += 1) {
      const rawLocation = rawLocations[i];
      const normalized = normalizeLocation(rawLocation, asRecordArray(rawLocation.chargers), i);
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

  const charger_count = normalizedLocations.reduce((sum, location) => sum + location.chargers.length, 0);

  if (!normalizedLocations.length || charger_count < 1) {
    return { ok: false, message: "Controleer de laadpaal- of locatiegegevens." };
  }

  const globalChargerIds = new Set<string>();
  for (const location of normalizedLocations) {
    for (const charger of location.chargers) {
      const key = charger.client_charger_id;
      if (globalChargerIds.has(key)) {
        return { ok: false, message: "Controleer dubbele laadpaalreferenties." };
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function isHexSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function acceptanceVersionRef(acceptance: Record<string, unknown>, fallback: string): string {
  return pickString(acceptance, ["versionRef", "version_ref", "version"]) || fallback;
}

function acceptanceVersionHash(acceptance: Record<string, unknown>): string | null {
  const hash = pickString(acceptance, ["versionHash", "version_hash"]);
  return hash && isHexSha256(hash) ? hash.toLowerCase() : null;
}

function buildDocumentSlotRows(
  dossier_id: string,
  locations: NormalizedLocation[],
  locationIdByClientId: Map<string, string>,
  chargerIdByClientId: Map<string, InsertedChargerRef>,
) {
  const rows: DocumentSlotRow[] = [{
    dossier_id,
    location_id: null,
    charger_id: null,
    client_slot_id: "dossier-contract-or-mandate",
    document_type: "mandate_or_authorization",
    status: "expected",
    required: true,
    title: "Machtiging of akkoord voor verwerking",
    metadata: { source: "signup_submit" },
  }];

  for (const location of locations) {
    const location_id = locationIdByClientId.get(location.client_location_id) || null;

    for (const charger of location.chargers) {
      const insertedCharger = chargerIdByClientId.get(charger.client_charger_id);
      if (!insertedCharger?.id || !location_id) continue;

      const metadata = {
        source: "signup_submit",
        client_location_id: location.client_location_id,
        client_charger_id: charger.client_charger_id,
      };

      rows.push({
        dossier_id,
        location_id,
        charger_id: insertedCharger.id,
        client_slot_id: `charger-${charger.client_charger_id}-mid-evidence`,
        document_type: "mid_meter_evidence",
        status: "expected",
        required: true,
        title: "MID bewijs laadpaal",
        metadata,
      });

      rows.push({
        dossier_id,
        location_id,
        charger_id: insertedCharger.id,
        client_slot_id: `charger-${charger.client_charger_id}-invoice-or-ownership`,
        document_type: "invoice_or_ownership_evidence",
        status: "expected",
        required: true,
        title: "Factuur of eigendomsbewijs laadpaal",
        metadata,
      });
    }
  }

  return rows;
}

function buildLegalAcceptanceRows(
  body: SignupSubmitPayload,
  dossier_id: string,
  customer_id: string,
  meta: { ip_hash: string | null; user_agent_hash: string | null },
) {
  const rows: LegalAcceptanceRow[] = [];

  for (const spec of LEGAL_ACCEPTANCE_SPECS) {
    const acceptance = getNestedRecord(body, spec.payloadKey);
    if (!acceptance || acceptance.accepted !== true) continue;

    rows.push({
      dossier_id,
      customer_id,
      acceptance_type: spec.acceptance_type,
      status: "accepted",
      version_ref: acceptanceVersionRef(acceptance, spec.defaultVersionRef),
      version_hash: acceptanceVersionHash(acceptance),
      actor_type: "customer",
      actor_ref: customer_id,
      ip_hash: meta.ip_hash,
      user_agent_hash: meta.user_agent_hash,
      evidence_data: {
        source: "signup_submit",
        accepted: true,
      },
    });
  }

  return rows;
}

async function parseJsonBody(req: Request): Promise<{ ok: true; body: SignupSubmitPayload } | { ok: false }> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false };
    return { ok: true, body: body as SignupSubmitPayload };
  } catch (_e) {
    return { ok: false };
  }
}

function validateSubmitContract(body: SignupSubmitPayload): string | null {
  if (!ACCOUNT_TYPES.has(getString(body.accountType))) {
    return "Controleer het type aanmelding.";
  }

  if (!isRecord(body.applicant)) {
    return "Controleer de aanvragergegevens.";
  }

  const email = getString(body.applicant.email);
  if (!email) {
    return "Controleer het e-mailadres.";
  }

  const consentBundleAcceptance = getNestedRecord(body, "consentBundleAcceptance");
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

async function reserveOrReplayIdempotency(
  SB: any,
  key: string,
  payload_hash: string,
): Promise<
  | { ok: true; replay: false }
  | { ok: true; replay: true; status: number; body: unknown }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; status: number; code: string; message: string }
> {
  const { data: existing, error: lookupError } = await SB
    .from("app_idempotency_keys")
    .select("payload_hash,response_status,response_body")
    .eq("scope", IDEMPOTENCY_SCOPE)
    .eq("key", key)
    .maybeSingle();

  if (lookupError) {
    return {
      ok: false,
      conflict: false,
      status: 500,
      code: "service_unavailable",
      message: "Aanmelding tijdelijk niet beschikbaar.",
    };
  }

  if (existing) {
    if (existing.payload_hash !== payload_hash) {
      return { ok: false, conflict: true };
    }

    if (existing.response_status && existing.response_body) {
      return {
        ok: true,
        replay: true,
        status: Number(existing.response_status),
        body: existing.response_body,
      };
    }

    return {
      ok: false,
      conflict: false,
      status: 409,
      code: "request_in_progress",
      message: "Aanmelding wordt al verwerkt.",
    };
  }

  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await SB.from("app_idempotency_keys").insert([{
    scope: IDEMPOTENCY_SCOPE,
    key,
    payload_hash,
    locked_at: new Date().toISOString(),
    expires_at: expiresAt,
  }]);

  if (!insertError) {
    return { ok: true, replay: false };
  }

  // Race-safe fallback: another request may have inserted the row first.
  const retry = await SB
    .from("app_idempotency_keys")
    .select("payload_hash,response_status,response_body")
    .eq("scope", IDEMPOTENCY_SCOPE)
    .eq("key", key)
    .maybeSingle();

  if (!retry.error && retry.data) {
    if (retry.data.payload_hash !== payload_hash) return { ok: false, conflict: true };
    if (retry.data.response_status && retry.data.response_body) {
      return {
        ok: true,
        replay: true,
        status: Number(retry.data.response_status),
        body: retry.data.response_body,
      };
    }
    return {
      ok: false,
      conflict: false,
      status: 409,
      code: "request_in_progress",
      message: "Aanmelding wordt al verwerkt.",
    };
  }

  return {
    ok: false,
    conflict: false,
    status: 500,
    code: "service_unavailable",
    message: "Aanmelding tijdelijk niet beschikbaar.",
  };
}

async function completeIdempotency(SB: any, key: string, status: number, body: unknown): Promise<void> {
  await SB
    .from("app_idempotency_keys")
    .update({
      response_status: status,
      response_body: body,
      completed_at: new Date().toISOString(),
    })
    .eq("scope", IDEMPOTENCY_SCOPE)
    .eq("key", key);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);

  if (req.method !== "POST") {
    return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  }

  if (!meta.idempotency_key) {
    return appErrorResponse(req, 400, "Idempotency-Key ontbreekt.", "missing_idempotency_key");
  }

  const SB = appSupabaseClient();
  if (!SB) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    await insertAppIntakeAuditFailOpen(SB, {
      event_type: "signup_submit_invalid_json",
      actor_type: "anonymous",
      event_data: { reason: "invalid_json" },
    }, meta);
    return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");
  }

  const payload_hash = await payloadHash(parsed.body);

  const idempotency = await reserveOrReplayIdempotency(SB, meta.idempotency_key, payload_hash);
  if (!idempotency.ok) {
    if (idempotency.conflict) {
      await insertAppIntakeAuditFailOpen(SB, {
        event_type: "signup_submit_idempotency_conflict",
        actor_type: "anonymous",
        event_data: { reason: "idempotency_conflict", scope: IDEMPOTENCY_SCOPE },
      }, meta);
      return appErrorResponse(req, 409, "Deze aanvraag hoort bij een andere payload.", "idempotency_conflict");
    }

    return appErrorResponse(req, idempotency.status, idempotency.message, idempotency.code);
  }

  if (idempotency.replay) {
    return appJsonResponse(req, idempotency.status, idempotency.body);
  }

  const validationError = validateSubmitContract(parsed.body);
  if (validationError) {
    await insertAppIntakeAuditFailOpen(SB, {
      event_type: "signup_submit_invalid_contract",
      actor_type: "anonymous",
      event_data: { reason: "invalid_signup_contract" },
    }, meta);
    return appErrorResponse(req, 400, validationError, "invalid_signup_contract");
  }

  const normalizedSubmit = normalizeLocationsAndChargers(parsed.body);
  if (!normalizedSubmit.ok) {
    await insertAppIntakeAuditFailOpen(SB, {
      event_type: "signup_submit_invalid_contract",
      actor_type: "anonymous",
      event_data: { reason: "invalid_signup_contract", detail: "locations_chargers" },
    }, meta);
    return appErrorResponse(req, 400, normalizedSubmit.message, "invalid_signup_contract");
  }

  const accountType = getString(parsed.body.accountType) as "particulier" | "zakelijk" | "vve";
  const applicant = parsed.body.applicant as Record<string, unknown>;
  const email_normalized = normalizeEmail(applicant.email);
  const display_name = displayNameFromApplicant(applicant, email_normalized);

  const { data: existingIdentity, error: identityLookupError } = await SB
    .from("app_customer_identities")
    .select("customer_id")
    .eq("email_normalized", email_normalized)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (identityLookupError) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  let customer_id = existingIdentity?.customer_id || null;
  let customerEventType = "customer_matched";

  if (!customer_id) {
    const { data: customer, error: customerInsertError } = await SB
      .from("app_customers")
      .insert([{
        customer_type: accountType,
        display_name,
        preferred_language: "nl",
        primary_email_normalized: email_normalized,
        status: "active",
      }])
      .select("id")
      .single();

    if (customerInsertError || !customer?.id) {
      return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
    }

    customer_id = customer.id;
    customerEventType = "customer_created";

    const { error: identityInsertError } = await SB
      .from("app_customer_identities")
      .insert([{
        customer_id,
        email_normalized,
        identity_provider: "supabase",
        status: "active",
      }]);

    if (identityInsertError) {
      return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
    }
  }

  const { data: dossier, error: dossierInsertError } = await SB
    .from("app_customer_dossiers")
    .insert([{
      customer_id,
      account_type: accountType,
      status: "submitted",
      retention_class: "standard",
      submitted_at: new Date().toISOString(),
    }])
    .select("id")
    .single();

  if (dossierInsertError || !dossier?.id) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const dossier_id = dossier.id;

  const locationRows = normalizedSubmit.locations.map((location) => ({
    dossier_id,
    client_location_id: location.client_location_id,
    label: location.label,
    status: "submitted",
    postcode_normalized: location.postcode_normalized,
    house_number: location.house_number,
    suffix_normalized: location.suffix_normalized,
    street: location.street,
    city: location.city,
    country: location.country,
    lookup_provider: location.lookup_provider,
    lookup_provider_id: location.lookup_provider_id,
    lookup_metadata: location.lookup_metadata,
  }));

  const { data: insertedLocations, error: locationInsertError } = await SB
    .from("app_dossier_locations")
    .insert(locationRows)
    .select("id,client_location_id");

  if (locationInsertError || !Array.isArray(insertedLocations)) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const locationIdByClientId = new Map<string, string>();
  for (const location of insertedLocations) {
    if (location?.client_location_id && location?.id) {
      locationIdByClientId.set(String(location.client_location_id), String(location.id));
    }
  }

  const chargerRows = normalizedSubmit.locations.flatMap((location) => {
    const location_id = locationIdByClientId.get(location.client_location_id);
    if (!location_id) return [];

    return location.chargers.map((charger) => ({
      dossier_id,
      location_id,
      client_charger_id: charger.client_charger_id,
      status: "submitted",
      brand_id: charger.brand_id,
      brand_label: charger.brand_label,
      manual_brand: charger.manual_brand,
      model_id: charger.model_id,
      model_label: charger.model_label,
      manual_model: charger.manual_model,
      serial_number: charger.serial_number,
      mid_number: charger.mid_number,
      mid_status: "submitted",
      backend_supplier_id: charger.backend_supplier_id,
      backend_supplier_label: charger.backend_supplier_label,
      manual_backend_supplier: charger.manual_backend_supplier,
      installation_year: charger.installation_year,
      solar_export_status: charger.solar_export_status,
    }));
  });

  if (chargerRows.length !== normalizedSubmit.charger_count) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const { data: insertedChargers, error: chargerInsertError } = await SB
    .from("app_dossier_chargers")
    .insert(chargerRows)
    .select("id,location_id,client_charger_id");

  if (chargerInsertError || !Array.isArray(insertedChargers)) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const chargerIdByClientId = new Map<string, InsertedChargerRef>();
  for (const charger of insertedChargers) {
    if (charger?.id && charger?.location_id && charger?.client_charger_id) {
      chargerIdByClientId.set(String(charger.client_charger_id), {
        id: String(charger.id),
        location_id: String(charger.location_id),
        client_charger_id: String(charger.client_charger_id),
      });
    }
  }

  if (chargerIdByClientId.size !== normalizedSubmit.charger_count) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const documentSlotRows = buildDocumentSlotRows(
    dossier_id,
    normalizedSubmit.locations,
    locationIdByClientId,
    chargerIdByClientId,
  );

  const { error: documentSlotInsertError } = await SB
    .from("app_dossier_document_slots")
    .insert(documentSlotRows);

  if (documentSlotInsertError) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const legalAcceptanceRows = buildLegalAcceptanceRows(parsed.body, dossier_id, customer_id, meta);

  const { error: legalAcceptanceInsertError } = await SB
    .from("app_dossier_legal_acceptances")
    .insert(legalAcceptanceRows);

  if (legalAcceptanceInsertError) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  await insertAppAuditFailOpen(SB, {
    event_type: customerEventType,
    scope_type: "customer",
    scope_id: customer_id,
    customer_id,
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      account_type: accountType,
      matched_by: customerEventType === "customer_matched" ? "email_normalized" : null,
    },
  }, meta);

  await insertAppAuditFailOpen(SB, {
    event_type: "dossier_created",
    scope_type: "dossier",
    scope_id: dossier_id,
    customer_id,
    dossier_id,
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      account_type: accountType,
      status: "submitted",
      retention_class: "standard",
    },
  }, meta);

  await insertAppAuditFailOpen(SB, {
    event_type: "locations_created",
    scope_type: "dossier",
    scope_id: dossier_id,
    customer_id,
    dossier_id,
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      count: normalizedSubmit.location_count,
      client_location_ids: normalizedSubmit.locations.map((location) => location.client_location_id),
    },
  }, meta);

  await insertAppAuditFailOpen(SB, {
    event_type: "chargers_created",
    scope_type: "dossier",
    scope_id: dossier_id,
    customer_id,
    dossier_id,
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      count: normalizedSubmit.charger_count,
      client_charger_ids: normalizedSubmit.locations.flatMap((location) =>
        location.chargers.map((charger) => charger.client_charger_id)
      ),
    },
  }, meta);

  await insertAppAuditFailOpen(SB, {
    event_type: "document_slots_created",
    scope_type: "dossier",
    scope_id: dossier_id,
    customer_id,
    dossier_id,
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      count: documentSlotRows.length,
      document_types: uniqueStrings(documentSlotRows.map((row) => row.document_type)),
    },
  }, meta);

  await insertAppAuditFailOpen(SB, {
    event_type: "legal_acceptances_created",
    scope_type: "dossier",
    scope_id: dossier_id,
    customer_id,
    dossier_id,
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      count: legalAcceptanceRows.length,
      acceptance_types: uniqueStrings(legalAcceptanceRows.map((row) => row.acceptance_type)),
    },
  }, meta);

  await insertAppIntakeAuditFailOpen(SB, {
    event_type: "signup_submit_write_accepted",
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      account_type: accountType,
      customer_id,
      dossier_id,
      scope: IDEMPOTENCY_SCOPE,
      mode: "write_v3",
      location_count: normalizedSubmit.location_count,
      charger_count: normalizedSubmit.charger_count,
      document_slot_count: documentSlotRows.length,
      legal_acceptance_count: legalAcceptanceRows.length,
    },
  }, meta);

  const responseBody = {
    ok: true,
    mode: "write_v3",
    request_id: meta.request_id,
    customer_id,
    dossier_id,
    location_count: normalizedSubmit.location_count,
    charger_count: normalizedSubmit.charger_count,
    document_slot_count: documentSlotRows.length,
    legal_acceptance_count: legalAcceptanceRows.length,
    payload_hash,
    message:
      "Foundation submit geaccepteerd; dossier shell, locaties, laadpalen, document-slots en juridische acceptaties zijn aangemaakt. Uploadverwerking is nog niet geimplementeerd.",
  };

  await completeIdempotency(SB, meta.idempotency_key, 200, responseBody);

  return appJsonResponse(req, 200, responseBody);
});
