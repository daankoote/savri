// supabase/functions/api-app-dashboard-get/index.ts
//
// Lean customer-safe dashboard read projection for the new /app portal.
// Frontend may assist; backend decides.
//
// This endpoint reads only existing app_* facts required to replace factual
// mock dashboard data later. It does not write successful-read audit events,
// does not create timeline/request/kWh/result/fee data, and does not expose raw
// audit, storage, hash, identity, or Auth data.

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
} from "../_shared/app_foundation.ts";
import {
  requireAppCaseAccess,
  requireAppCustomer,
  requireAppDossierAccess,
} from "../_shared/app_customer_auth.ts";
import {
  type CustomerInformationRequestCustomerReadV1,
  type CustomerInformationRequestHistoryEntryV1,
  type CustomerInformationRequestV1,
  parseCustomerInformationRequestReadSource,
} from "../_shared/app_customer_information_request.ts";

type DashboardPayload = {
  dossier_id?: unknown;
  mode?: unknown;
};

type LocationRow = {
  id?: string;
  client_location_id?: string | null;
  label?: string | null;
  status?: string | null;
  postcode_normalized?: string | null;
  house_number?: string | null;
  suffix_normalized?: string | null;
  street?: string | null;
  city?: string | null;
  country?: string | null;
  created_at?: string | null;
};

type ChargerRow = {
  id?: string;
  location_id?: string | null;
  client_charger_id?: string | null;
  status?: string | null;
  brand_id?: string | null;
  brand_label?: string | null;
  manual_brand?: string | null;
  model_id?: string | null;
  model_label?: string | null;
  manual_model?: string | null;
  serial_number?: string | null;
  mid_number?: string | null;
  mid_status?: string | null;
  backend_supplier_id?: string | null;
  backend_supplier_label?: string | null;
  manual_backend_supplier?: string | null;
  installation_year?: number | null;
  solar_export_status?: string | null;
  created_at?: string | null;
};

type DocumentSlotRow = {
  id?: string;
  location_id?: string | null;
  charger_id?: string | null;
  document_type?: string | null;
  status?: string | null;
  required?: boolean | null;
  title?: string | null;
  current_version_id?: string | null;
  current_version_number?: number | null;
  created_at?: string | null;
};

type DocumentVersionRow = {
  id?: string;
  document_slot_id?: string | null;
  document_file_id?: string | null;
  version_number?: number | null;
  status?: string | null;
};

type DocumentFileRow = {
  id?: string;
  original_file_name?: string | null;
  normalized_file_name?: string | null;
  status?: string | null;
};

type LegalAcceptanceRow = {
  acceptance_type?: string | null;
  status?: string | null;
  version_ref?: string | null;
  accepted_at?: string | null;
  created_at?: string | null;
};

type SafeDossier = {
  dossier_id: string;
  dossier_number: string | null;
  account_type: "particulier" | "zakelijk" | "vve";
  portal_context: "customer" | "business";
  status: string;
  document_changes_allowed: boolean;
  case_id: string;
  case_reference: string;
  application_label: string;
};

type SafeSelectedDossier = SafeDossier;

type SafeLocation = {
  location_id: string;
  label: string | null;
  status: string;
  declared_address: string | null;
  address: {
    postcode: string;
    house_number: string;
    suffix: string | null;
    street: string | null;
    city: string | null;
    country: string;
  };
};

type SafeCharger = {
  charger_id: string;
  location_id: string;
  status: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  mid_number: string | null;
  mid_status: string;
  installation_year: number | null;
  backend_supplier: string | null;
  solar_export_status: string | null;
};

type SafeDocumentSlot = {
  document_slot_id: string;
  location_id: string | null;
  charger_id: string | null;
  document_type: string;
  required: boolean;
  title: string;
  status: string;
  current_version_number: number | null;
  current_file_name: string | null;
};

type SafeLegalAcceptance = {
  acceptance_type: string;
  version: string;
  status: string;
  accepted_at: string | null;
  active: boolean;
};

type TimelineEventType =
  | "dossier_submitted"
  | "correction_requested"
  | "correction_submitted"
  | "review_completed";

type SafeTimelineEvent = {
  event_id: string;
  event_type: TimelineEventType;
  occurred_at: string;
  title: string;
  text: string;
};

type DashboardResponse = {
  ok: true;
  mode: "dashboard_read_v1";
  request_id: string;
  dossiers: SafeDossier[];
  selected_dossier: SafeSelectedDossier;
  locations: SafeLocation[];
  chargers: SafeCharger[];
  document_slots: SafeDocumentSlot[];
  legal_acceptances: SafeLegalAcceptance[];
  timeline: SafeTimelineEvent[];
  information_request: CustomerInformationRequestV1 | null;
  information_request_history:
    readonly CustomerInformationRequestHistoryEntryV1[];
};

type ApplicationIndexResponse = {
  ok: true;
  mode: "dashboard_application_index_v1";
  request_id: string;
  applications: SafeDossier[];
};

type DashboardCaseReadModel = Omit<
  DashboardResponse,
  | "ok"
  | "mode"
  | "request_id"
  | "timeline"
  | "information_request"
  | "information_request_history"
>;

type NormalizedPayload =
  | { mode: "applications" }
  | { mode: "detail"; dossier_id: string };

type NormalizationError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

const MODE = "dashboard_read_v1";
const APPLICATION_INDEX_MODE = "dashboard_application_index_v1";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const TIMELINE_EVENT_ID_RE = /^tle_[0-9a-f]{32}$/;
const TIMELINE_COPY: Record<
  TimelineEventType,
  { title: string; text: string; phasePriority: number }
> = {
  dossier_submitted: {
    title: "Dossier ontvangen",
    text: "Uw dossier is ontvangen en in behandeling.",
    phasePriority: 20,
  },
  correction_requested: {
    title: "Aanvulling gevraagd",
    text: "Voor dit dossier is aanvullende informatie nodig.",
    phasePriority: 30,
  },
  correction_submitted: {
    title: "Aanvulling ontvangen",
    text: "Uw aanvulling is ontvangen en wordt beoordeeld.",
    phasePriority: 40,
  },
  review_completed: {
    title: "Gegevens gecontroleerd",
    text: "De aangeleverde gegevens zijn gecontroleerd.",
    phasePriority: 50,
  },
};
const ACCOUNT_TYPES = new Set(["particulier", "zakelijk", "vve"]);

function appSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullString(value: unknown): string | null {
  const stringValue = getString(value);
  return stringValue || null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isUtcTimestamp(value: string): boolean {
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime()) &&
    timestamp.toISOString() === value;
}

function mapTimelineEvent(value: unknown): SafeTimelineEvent | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["event_id", "event_type", "occurred_at"])
  ) return null;

  const eventId = getString(value.event_id);
  const eventType = getString(value.event_type);
  const occurredAt = getString(value.occurred_at);
  if (!TIMELINE_EVENT_ID_RE.test(eventId) || !isUtcTimestamp(occurredAt)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(TIMELINE_COPY, eventType)) {
    return null;
  }
  const typedEvent = eventType as TimelineEventType;

  return {
    event_id: eventId,
    event_type: typedEvent,
    occurred_at: occurredAt,
    title: TIMELINE_COPY[typedEvent].title,
    text: TIMELINE_COPY[typedEvent].text,
  };
}

function timelineIsOrdered(events: SafeTimelineEvent[]): boolean {
  if (new Set(events.map((event) => event.event_id)).size !== events.length) {
    return false;
  }
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    if (previous.occurred_at < current.occurred_at) return false;
    if (previous.occurred_at !== current.occurred_at) continue;
    const previousPriority = TIMELINE_COPY[previous.event_type].phasePriority;
    const currentPriority = TIMELINE_COPY[current.event_type].phasePriority;
    if (previousPriority < currentPriority) return false;
    if (
      previousPriority === currentPriority &&
      previous.event_id > current.event_id
    ) return false;
  }
  return true;
}

async function loadCustomerTimeline(
  SB: any,
  authUserId: string,
  caseId: string,
): Promise<SafeTimelineEvent[]> {
  const result = await SB.rpc("app_customer_case_timeline_read_v1", {
    p_auth_user_id: authUserId,
    p_case_id: caseId,
  });
  if (result.error || !isRecord(result.data)) {
    throw new Error("customer_timeline_read_failed");
  }
  if (result.data.ok !== true) {
    if (
      hasExactKeys(result.data, ["ok", "status", "code"]) &&
      result.data.status === 404 &&
      result.data.code === "customer_case_timeline_not_found_or_forbidden"
    ) {
      throw {
        ok: false,
        status: 404,
        code: "dossier_not_found_or_forbidden",
        message: "Dossier niet gevonden.",
      };
    }
    throw new Error("customer_timeline_read_failed");
  }
  if (
    !hasExactKeys(result.data, ["ok", "status", "code", "timeline"]) ||
    result.data.status !== 200 || result.data.code !== "ok" ||
    !Array.isArray(result.data.timeline) || result.data.timeline.length > 50
  ) {
    throw new Error("customer_timeline_projection_failed");
  }

  const timeline = (result.data.timeline as unknown[]).map(mapTimelineEvent);
  if (timeline.some((event) => !event)) {
    throw new Error("customer_timeline_projection_failed");
  }
  const safeTimeline = timeline as SafeTimelineEvent[];
  if (!timelineIsOrdered(safeTimeline)) {
    throw new Error("customer_timeline_projection_failed");
  }
  return safeTimeline;
}

async function loadCustomerInformationRequest(
  SB: any,
  authUserId: string,
  caseReference: string,
): Promise<CustomerInformationRequestCustomerReadV1> {
  const result = await SB.rpc(
    "app_customer_information_request_customer_read_v1",
    { p_auth_user_id: authUserId, p_case_ref: caseReference },
  );
  if (result.error) throw new Error("customer_information_request_read_failed");
  const read = parseCustomerInformationRequestReadSource(result.data);
  if (read === false) {
    throw new Error("customer_information_request_projection_failed");
  }
  return read;
}

function safeDossierNumber(value: unknown): string | null {
  const dossierNumber = getString(value);
  return dossierNumber || null;
}

function mapApplication(value: unknown): SafeDossier | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "account_type",
      "application_label",
      "case_id",
      "case_reference",
      "document_changes_allowed",
      "dossier_id",
      "dossier_number",
      "portal_context",
      "status",
    ])
  ) return null;

  const dossierId = getString(value.dossier_id);
  const caseId = getString(value.case_id);
  const caseReference = getString(value.case_reference);
  const accountType = getString(value.account_type);
  const portalContext = getString(value.portal_context);
  const status = getString(value.status);
  const applicationLabel = getString(value.application_label);
  if (
    !isUuid(dossierId) || !isUuid(caseId) ||
    !CASE_REFERENCE_RE.test(caseReference) ||
    !ACCOUNT_TYPES.has(accountType) || !status ||
    (portalContext !== "customer" && portalContext !== "business") ||
    (accountType === "particulier"
      ? portalContext !== "customer"
      : portalContext !== "business") ||
    typeof value.document_changes_allowed !== "boolean" ||
    !applicationLabel || applicationLabel.length > 120
  ) return null;

  return {
    dossier_id: dossierId,
    dossier_number: safeDossierNumber(value.dossier_number),
    account_type: accountType as SafeDossier["account_type"],
    portal_context: portalContext as SafeDossier["portal_context"],
    status,
    document_changes_allowed: value.document_changes_allowed,
    case_id: caseId,
    case_reference: caseReference,
    application_label: applicationLabel,
  };
}

async function loadCustomerApplications(
  SB: any,
  authUserId: string,
): Promise<SafeDossier[]> {
  const result = await SB.rpc("app_customer_application_index_read_v1", {
    p_auth_user_id: authUserId,
  });
  if (result.error || !isRecord(result.data)) {
    throw new Error("customer_application_index_read_failed");
  }
  if (
    !hasExactKeys(result.data, ["ok", "status", "code", "applications"]) ||
    result.data.ok !== true || result.data.status !== 200 ||
    result.data.code !== "ok" || !Array.isArray(result.data.applications)
  ) {
    throw new Error("customer_application_index_projection_failed");
  }

  const applications = (result.data.applications as unknown[]).map(
    mapApplication,
  );
  if (
    applications.some((application) => !application) ||
    new Set(
        applications.map((application) => application?.case_reference),
      ).size !== applications.length
  ) {
    throw new Error("customer_application_index_projection_failed");
  }
  return applications as SafeDossier[];
}

async function parseJsonBody(
  req: Request,
): Promise<{ ok: true; body: DashboardPayload } | { ok: false }> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false };
    return { ok: true, body: body as DashboardPayload };
  } catch (_e) {
    return { ok: false };
  }
}

function normalizePayload(
  body: DashboardPayload,
): { ok: true; payload: NormalizedPayload } | NormalizationError {
  const keys = Object.keys(body);
  if (
    keys.length === 1 && keys[0] === "mode" &&
    getString(body.mode) === "applications"
  ) {
    return { ok: true, payload: { mode: "applications" } };
  }

  if (keys.length !== 1 || !keys.includes("dossier_id")) {
    return {
      ok: false,
      status: 400,
      code: "invalid_body",
      message: "Controleer de aanvraag.",
    };
  }

  const dossierId = getString(body.dossier_id).toLowerCase();
  if (!isUuid(dossierId)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_dossier_id",
      message: "Controleer het dossier.",
    };
  }

  return { ok: true, payload: { mode: "detail", dossier_id: dossierId } };
}

async function loadSignedCaseReadModel(
  SB: any,
  summaries: SafeDossier[],
  customerId: string,
  caseId: string,
): Promise<DashboardCaseReadModel> {
  const promotionsResult = await SB.from("app_signup_promotions")
    .select("case_id,intake_id,account_type")
    .eq("customer_id", customerId)
    .eq("case_id", caseId)
    .maybeSingle();
  if (promotionsResult.error) {
    throw new Error("signed_case_read_failed");
  }

  const selectedIntakeId = getString(promotionsResult.data?.intake_id);
  const selected = summaries.find((item) => item.case_id === caseId);
  if (!selected || !isUuid(selectedIntakeId)) {
    throw new Error("selected_signed_case_projection_failed");
  }

  const [relationsResult, evidenceResult, acceptancesResult] = await Promise
    .all([
      SB.from("app_case_location_relations")
        .select("id,relation_id,location_id,event_type,recorded_at")
        .eq("case_id", caseId)
        .order("recorded_at", { ascending: false }),
      SB.from("app_evidence_files")
        .select("id,case_id,document_type,created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true }),
      SB.from("app_signup_legal_acceptances")
        .select("action_type,document_version,accepted_at")
        .eq("intake_id", selectedIntakeId)
        .order("accepted_at", { ascending: true }),
    ]);
  if (
    relationsResult.error || evidenceResult.error || acceptancesResult.error
  ) {
    throw new Error("signed_case_detail_read_failed");
  }

  const currentRelations = new Map<string, JsonObject>();
  for (const relation of rows(relationsResult.data)) {
    const relationId = getString(relation.relation_id);
    if (relationId && !currentRelations.has(relationId)) {
      currentRelations.set(relationId, relation);
    }
  }
  const locationIds = [...currentRelations.values()]
    .filter((relation) => getString(relation.event_type) === "linked")
    .map((relation) => getString(relation.location_id))
    .filter(isUuid);
  const observationsResult = locationIds.length
    ? await SB.from("app_location_address_observations")
      .select("id,location_id,declared_address_text,recorded_at")
      .in("location_id", locationIds)
      .eq("observation_kind", "customer_declared")
      .order("recorded_at", { ascending: false })
    : { data: [], error: null };
  if (observationsResult.error) throw new Error("signed_location_read_failed");
  const observations = rows(observationsResult.data);
  const locations: SafeLocation[] = locationIds.map((locationId) => {
    const observation = observations.find((item) =>
      getString(item.location_id) === locationId
    );
    const declaredAddress = getString(observation?.declared_address_text);
    if (!declaredAddress) throw new Error("signed_location_projection_failed");
    return {
      location_id: locationId,
      label: null,
      status: "submitted_for_review",
      declared_address: declaredAddress,
      address: {
        postcode: "",
        house_number: "",
        suffix: null,
        street: null,
        city: null,
        country: "Nederland",
      },
    };
  });

  const chargerRootsResult = await SB.from("app_chargers")
    .select("id,location_id")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });
  if (chargerRootsResult.error) throw new Error("signed_charger_read_failed");
  const chargerRoots = rows(chargerRootsResult.data);
  const chargerIds = chargerRoots.map((item) => getString(item.id)).filter(
    isUuid,
  );
  const declarationsResult = chargerIds.length
    ? await SB.from("app_charger_declarations")
      .select(
        "charger_id,brand,model,serial_number,mid_identifier,installation_year,backend_supplier,solar_export_declaration,declaration_status",
      )
      .in("charger_id", chargerIds)
    : { data: [], error: null };
  if (declarationsResult.error) {
    throw new Error("signed_charger_declaration_read_failed");
  }
  const declarationRows = rows(declarationsResult.data);
  const chargers: SafeCharger[] = chargerRoots.map((root) => {
    const chargerId = getString(root.id);
    const locationId = getString(root.location_id);
    const declaration = declarationRows.find((item) =>
      getString(item.charger_id) === chargerId
    );
    const declarationStatus = getString(declaration?.declaration_status);
    if (
      !isUuid(chargerId) || !locationIds.includes(locationId) ||
      !declaration || declarationStatus !== "confirmed_awaiting_review"
    ) {
      throw new Error("signed_charger_projection_failed");
    }
    const installationYear = Number(declaration.installation_year);
    return {
      charger_id: chargerId,
      location_id: locationId,
      status: "submitted_for_review",
      brand: nullString(declaration.brand),
      model: nullString(declaration.model),
      serial_number: nullString(declaration.serial_number),
      mid_number: nullString(declaration.mid_identifier),
      mid_status: "submitted_for_review",
      installation_year: Number.isInteger(installationYear)
        ? installationYear
        : null,
      backend_supplier: nullString(declaration.backend_supplier),
      solar_export_status: nullString(declaration.solar_export_declaration),
    };
  });

  const evidenceRows = rows(evidenceResult.data);
  const evidenceIds = evidenceRows.map((item) => getString(item.id)).filter(
    isUuid,
  );
  const [versionsResult, contextsResult] = evidenceIds.length
    ? await Promise.all([
      SB.from("app_evidence_versions")
        .select("evidence_file_id,version_number,status")
        .in("evidence_file_id", evidenceIds),
      SB.from("app_evidence_declaration_contexts")
        .select("evidence_file_id,location_id,charger_id,association_basis")
        .in("evidence_file_id", evidenceIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (versionsResult.error || contextsResult.error) {
    throw new Error("signed_evidence_read_failed");
  }
  const versions = rows(versionsResult.data);
  const contexts = rows(contextsResult.data);
  const documentSlots: SafeDocumentSlot[] = evidenceRows.map((evidence) => {
    const evidenceId = getString(evidence.id);
    const version = versions.find((item) =>
      getString(item.evidence_file_id) === evidenceId
    );
    const documentType = getString(evidence.document_type);
    const context = contexts.find((item) =>
      getString(item.evidence_file_id) === evidenceId
    );
    if (!isUuid(evidenceId) || !version || !context || !documentType) {
      throw new Error("signed_evidence_projection_failed");
    }
    return {
      document_slot_id: evidenceId,
      location_id: isUuid(context.location_id)
        ? String(context.location_id)
        : null,
      charger_id: isUuid(context.charger_id)
        ? String(context.charger_id)
        : null,
      document_type: documentType,
      required: true,
      title: signedDocumentTitle(documentType),
      status: getString(version.status),
      current_version_number: Number(version.version_number),
      current_file_name: null,
    };
  });

  const legalAcceptances: SafeLegalAcceptance[] = rows(acceptancesResult.data)
    .map((acceptance) => ({
      acceptance_type: getString(acceptance.action_type),
      version: getString(acceptance.document_version),
      status: "accepted",
      accepted_at: nullString(acceptance.accepted_at),
      active: true,
    }))
    .filter((item) => item.acceptance_type && item.version);

  return {
    dossiers: summaries,
    selected_dossier: selected,
    locations,
    chargers,
    document_slots: documentSlots,
    legal_acceptances: legalAcceptances,
  };
}

function signedDocumentTitle(documentType: string): string {
  const titles: Record<string, string> = {
    organization_extract: "KvK-uittreksel",
    energy_bill_or_contract: "Energiecontract of -nota",
    installation_invoice: "Installatiefactuur laadpaal",
  };
  return titles[documentType] || "Ingediend document";
}

type JsonObject = Record<string, unknown>;

function rows(value: unknown): JsonObject[] {
  return Array.isArray(value) && value.every(isRecord)
    ? value as JsonObject[]
    : [];
}

function mapLocation(row: LocationRow): SafeLocation | null {
  const id = getString(row.id);
  const status = getString(row.status);
  const postcode = getString(row.postcode_normalized);
  const houseNumber = getString(row.house_number);
  const country = getString(row.country) || "Nederland";
  if (!isUuid(id) || !status || !postcode || !houseNumber) return null;

  return {
    location_id: id,
    label: nullString(row.label),
    status,
    declared_address: null,
    address: {
      postcode,
      house_number: houseNumber,
      suffix: nullString(row.suffix_normalized),
      street: nullString(row.street),
      city: nullString(row.city),
      country,
    },
  };
}

function firstLabel(...values: unknown[]): string | null {
  for (const value of values) {
    const label = nullString(value);
    if (label) return label;
  }
  return null;
}

function mapCharger(row: ChargerRow): SafeCharger | null {
  const id = getString(row.id);
  const locationId = getString(row.location_id);
  const status = getString(row.status);
  const midNumber = getString(row.mid_number);
  const midStatus = getString(row.mid_status);
  if (
    !isUuid(id) || !isUuid(locationId) || !status || !midNumber || !midStatus
  ) return null;

  return {
    charger_id: id,
    location_id: locationId,
    status,
    brand: firstLabel(row.manual_brand, row.brand_label, row.brand_id),
    model: firstLabel(row.manual_model, row.model_label, row.model_id),
    serial_number: nullString(row.serial_number),
    mid_number: midNumber,
    mid_status: midStatus,
    installation_year: Number.isInteger(row.installation_year)
      ? Number(row.installation_year)
      : null,
    backend_supplier: firstLabel(
      row.manual_backend_supplier,
      row.backend_supplier_label,
      row.backend_supplier_id,
    ),
    solar_export_status: nullString(row.solar_export_status),
  };
}

function mapDocumentSlot(
  row: DocumentSlotRow,
  fileNamesByVersionId: Map<string, string>,
): SafeDocumentSlot | null {
  const id = getString(row.id);
  const documentType = getString(row.document_type);
  const status = getString(row.status);
  const title = getString(row.title);
  if (!isUuid(id) || !documentType || !status || !title) return null;

  const currentVersionId = getString(row.current_version_id);

  return {
    document_slot_id: id,
    location_id: isUuid(row.location_id) ? String(row.location_id) : null,
    charger_id: isUuid(row.charger_id) ? String(row.charger_id) : null,
    document_type: documentType,
    required: row.required === true,
    title,
    status,
    current_version_number: Number.isInteger(row.current_version_number)
      ? Number(row.current_version_number)
      : null,
    current_file_name: currentVersionId
      ? fileNamesByVersionId.get(currentVersionId) || null
      : null,
  };
}

function mapLegalAcceptance(
  row: LegalAcceptanceRow,
): SafeLegalAcceptance | null {
  const acceptanceType = getString(row.acceptance_type);
  const version = getString(row.version_ref);
  const status = getString(row.status);
  if (!acceptanceType || !version || !status) return null;

  return {
    acceptance_type: acceptanceType,
    version,
    status,
    accepted_at: nullString(row.accepted_at),
    active: status === "accepted",
  };
}

async function loadCurrentFileNamesByVersionId(
  SB: any,
  dossierId: string,
  slots: DocumentSlotRow[],
): Promise<Map<string, string>> {
  const currentVersionIds = slots
    .map((slot) => getString(slot.current_version_id))
    .filter((id) => isUuid(id));

  if (!currentVersionIds.length) return new Map();

  const { data: versions, error: versionError } = await SB
    .from("app_dossier_document_versions")
    .select("id,document_slot_id,document_file_id,version_number,status")
    .eq("dossier_id", dossierId)
    .in("id", currentVersionIds)
    .order("version_number", { ascending: true });

  if (versionError) throw new Error("version_read_failed");

  const versionRows =
    (Array.isArray(versions) ? versions : []) as DocumentVersionRow[];
  const fileIds = versionRows
    .map((version) => getString(version.document_file_id))
    .filter((id) => isUuid(id));

  if (!fileIds.length) return new Map();

  const { data: files, error: fileError } = await SB
    .from("app_dossier_document_files")
    .select("id,original_file_name,normalized_file_name,status")
    .eq("dossier_id", dossierId)
    .in("id", fileIds);

  if (fileError) throw new Error("file_read_failed");

  const fileRows = (Array.isArray(files) ? files : []) as DocumentFileRow[];
  const fileNamesByFileId = new Map<string, string>();
  for (const file of fileRows) {
    const fileId = getString(file.id);
    const fileName = firstLabel(
      file.original_file_name,
      file.normalized_file_name,
    );
    if (isUuid(fileId) && fileName) fileNamesByFileId.set(fileId, fileName);
  }

  const fileNamesByVersionId = new Map<string, string>();
  for (const version of versionRows) {
    const versionId = getString(version.id);
    const fileId = getString(version.document_file_id);
    const fileName = fileNamesByFileId.get(fileId);
    if (isUuid(versionId) && fileName) {
      fileNamesByVersionId.set(versionId, fileName);
    }
  }

  return fileNamesByVersionId;
}

async function loadDashboardReadModel(
  SB: any,
  summaries: SafeDossier[],
  customerId: string,
  dossierId: string,
): Promise<DashboardCaseReadModel> {
  const dossierSelect =
    "id,dossier_number,account_type,status,locked_at,created_at";

  const selectedDossierPromise = SB
    .from("app_customer_dossiers")
    .select(dossierSelect)
    .eq("id", dossierId)
    .eq("customer_id", customerId)
    .is("minimized_at", null)
    .neq("status", "expired_minimized")
    .maybeSingle();

  const locationsPromise = SB
    .from("app_dossier_locations")
    .select(
      "id,client_location_id,label,status,postcode_normalized,house_number,suffix_normalized,street,city,country,created_at",
    )
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });

  const chargersPromise = SB
    .from("app_dossier_chargers")
    .select(
      "id,location_id,client_charger_id,status,brand_id,brand_label,manual_brand,model_id,model_label,manual_model,serial_number,mid_number,mid_status,backend_supplier_id,backend_supplier_label,manual_backend_supplier,installation_year,solar_export_status,created_at",
    )
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });

  const slotsPromise = SB
    .from("app_dossier_document_slots")
    .select(
      "id,location_id,charger_id,document_type,status,required,title,current_version_id,current_version_number,created_at",
    )
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });

  const acceptancesPromise = SB
    .from("app_dossier_legal_acceptances")
    .select("acceptance_type,status,version_ref,accepted_at,created_at")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });

  const [
    selectedDossierResult,
    locationsResult,
    chargersResult,
    slotsResult,
    acceptancesResult,
  ] = await Promise.all([
    selectedDossierPromise,
    locationsPromise,
    chargersPromise,
    slotsPromise,
    acceptancesPromise,
  ]);

  if (
    selectedDossierResult.error ||
    locationsResult.error ||
    chargersResult.error ||
    slotsResult.error ||
    acceptancesResult.error
  ) {
    throw new Error("dashboard_read_failed");
  }

  const selectedDossier = summaries.find((item) =>
    item.dossier_id === dossierId &&
    getString(selectedDossierResult.data?.id) === dossierId
  );
  if (!selectedDossier) throw new Error("selected_dossier_projection_failed");

  const locationRows =
    (Array.isArray(locationsResult.data)
      ? locationsResult.data
      : []) as LocationRow[];
  const chargerRows =
    (Array.isArray(chargersResult.data)
      ? chargersResult.data
      : []) as ChargerRow[];
  const slotRows =
    (Array.isArray(slotsResult.data)
      ? slotsResult.data
      : []) as DocumentSlotRow[];
  const acceptanceRows =
    (Array.isArray(acceptancesResult.data)
      ? acceptancesResult.data
      : []) as LegalAcceptanceRow[];

  const fileNamesByVersionId = await loadCurrentFileNamesByVersionId(
    SB,
    dossierId,
    slotRows,
  );

  return {
    dossiers: summaries,
    selected_dossier: selectedDossier,
    locations: locationRows.map(mapLocation).filter((
      row,
    ): row is SafeLocation => !!row),
    chargers: chargerRows.map(mapCharger).filter((row): row is SafeCharger =>
      !!row
    ),
    document_slots: slotRows.map((row) =>
      mapDocumentSlot(row, fileNamesByVersionId)
    ).filter((row): row is SafeDocumentSlot => !!row),
    legal_acceptances: acceptanceRows.map(mapLegalAcceptance).filter((
      row,
    ): row is SafeLegalAcceptance => !!row),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);
  if (meta instanceof Response) return meta;

  if (req.method !== "POST") {
    return appErrorResponse(
      req,
      405,
      "Methode niet toegestaan.",
      "method_not_allowed",
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

  const normalized = normalizePayload(parsed.body);
  if (!normalized.ok) {
    return appErrorResponse(
      req,
      normalized.status,
      normalized.message,
      normalized.code,
    );
  }

  const SB = appSupabaseClient();
  if (!SB) {
    return appErrorResponse(
      req,
      503,
      "Dashboard is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }

  const authResult = await requireAppCustomer(req, SB);
  if (!authResult.ok) {
    return appErrorResponse(
      req,
      authResult.status,
      authResult.message,
      authResult.code,
    );
  }

  try {
    const applications = await loadCustomerApplications(
      SB,
      authResult.context.authUserId,
    );
    if (normalized.payload.mode === "applications") {
      const response: ApplicationIndexResponse = {
        ok: true,
        mode: APPLICATION_INDEX_MODE,
        request_id: meta.request_id,
        applications,
      };
      return appJsonResponse(req, 200, response);
    }
    const dossierId = normalized.payload.dossier_id;

    const selectedApplication = applications.find((application) =>
      application.dossier_id === dossierId
    );
    if (!selectedApplication) {
      throw {
        ok: false,
        status: 404,
        code: "dossier_not_found_or_forbidden",
        message: "Dossier niet gevonden.",
      };
    }

    const caseAccess = await requireAppCaseAccess(
      SB,
      authResult.context,
      dossierId,
    );
    const readModel = caseAccess.ok &&
        caseAccess.appCase.sourceClass === "signed_signup_intake"
      ? await loadSignedCaseReadModel(
        SB,
        applications,
        caseAccess.appCase.customerId,
        caseAccess.appCase.caseId,
      )
      : await (async () => {
        const accessResult = await requireAppDossierAccess(
          SB,
          authResult.context,
          dossierId,
        );
        if (!accessResult.ok) throw accessResult;
        return await loadDashboardReadModel(
          SB,
          applications,
          accessResult.dossier.customerId,
          accessResult.dossier.dossierId,
        );
      })();

    const [timeline, informationRequestRead] = await Promise.all([
      loadCustomerTimeline(
        SB,
        authResult.context.authUserId,
        readModel.selected_dossier.case_id,
      ),
      loadCustomerInformationRequest(
        SB,
        authResult.context.authUserId,
        readModel.selected_dossier.case_reference,
      ),
    ]);

    const response: DashboardResponse = {
      ok: true,
      mode: MODE,
      request_id: meta.request_id,
      ...readModel,
      timeline,
      information_request: informationRequestRead.request,
      information_request_history: informationRequestRead.history,
    };

    return appJsonResponse(req, 200, response);
  } catch (error) {
    if (isRecord(error) && error.ok === false) {
      return appErrorResponse(
        req,
        Number(error.status) || 404,
        typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Dossier niet gevonden.",
        getString(error.code) || "dossier_not_found_or_forbidden",
      );
    }
    return appErrorResponse(
      req,
      503,
      "Dashboard is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }
});
