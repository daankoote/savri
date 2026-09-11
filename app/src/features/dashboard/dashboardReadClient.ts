import { resolveAuthRuntimeConfig } from "../auth/authRuntimeConfig.ts";
import type {
  DashboardAccountType,
  DashboardApplicationIndex,
  DashboardCharger,
  DashboardDocumentSlot,
  DashboardDossierSummary,
  DashboardLegalAcceptance,
  DashboardLocation,
  DashboardReadModel,
  DashboardTimelineEvent,
  DashboardTimelineEventType,
} from "./dashboardTypes.ts";

export type DashboardReadErrorCode =
  | "not_configured"
  | "dossier_inaccessible"
  | "service_unavailable"
  | "invalid_response";

export type DashboardReadSafeError = {
  code: DashboardReadErrorCode;
  message: string;
};

export type DashboardReadResult =
  | { ok: true; model: DashboardReadModel }
  | { ok: false; error: DashboardReadSafeError; status?: number };

export type DashboardApplicationsResult =
  | { ok: true; model: DashboardApplicationIndex }
  | { ok: false; error: DashboardReadSafeError; status?: number };

type DashboardReadConfig = {
  accessToken: string;
  dossierId: string;
  fetchImpl?: typeof fetch;
  runtimeConfig?: { dashboardEndpointUrl: string; anonKey: string };
  signal?: AbortSignal;
};

type DashboardApplicationsConfig = Omit<DashboardReadConfig, "dossierId">;

type UnknownRecord = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const TIMELINE_EVENT_ID_RE = /^tle_[0-9a-f]{32}$/;
const TIMELINE_PHASE_PRIORITY: Record<DashboardTimelineEventType, number> = {
  dossier_submitted: 20,
  correction_requested: 30,
  correction_submitted: 40,
  review_completed: 50,
};

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function stringField(record: UnknownRecord, key: string): string {
  return typeof record[key] === "string" ? record[key].trim() : "";
}

function nullableStringField(
  record: UnknownRecord,
  key: string,
): string | null {
  const value = stringField(record, key);
  return value || null;
}

function numberField(record: UnknownRecord, key: string): number | null {
  return typeof record[key] === "number" && Number.isFinite(record[key])
    ? record[key]
    : null;
}

function booleanField(record: UnknownRecord, key: string): boolean {
  return record[key] === true;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isAccountType(value: string): value is DashboardAccountType {
  return value === "particulier" || value === "zakelijk" || value === "vve";
}

function isTimelineEventType(
  value: string,
): value is DashboardTimelineEventType {
  return Object.prototype.hasOwnProperty.call(TIMELINE_PHASE_PRIORITY, value);
}

function isUtcTimestamp(value: string): boolean {
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime()) &&
    timestamp.toISOString() === value;
}

function safeDashboardError(
  code: DashboardReadErrorCode,
): DashboardReadSafeError {
  const messages: Record<DashboardReadErrorCode, string> = {
    dossier_inaccessible: "Dit dossier is niet beschikbaar voor dit account.",
    invalid_response:
      "De dossiergegevens konden tijdelijk niet worden geladen. Probeer het opnieuw.",
    not_configured: "Dashboard is lokaal nog niet geconfigureerd.",
    service_unavailable:
      "De dossiergegevens konden tijdelijk niet worden geladen. Probeer het opnieuw.",
  };

  return { code, message: messages[code] };
}

function mapDashboardErrorCode(code: string): DashboardReadSafeError {
  if (
    code === "dossier_not_found_or_forbidden" || code === "dossier_not_found"
  ) {
    return safeDashboardError("dossier_inaccessible");
  }

  if (code === "service_unavailable") {
    return safeDashboardError("service_unavailable");
  }

  return safeDashboardError("invalid_response");
}

function parseDossier(value: unknown): DashboardDossierSummary | null {
  if (!isRecord(value)) return null;
  const accountType = stringField(value, "account_type");
  const portalContext = stringField(value, "portal_context");
  const applicationLabel = stringField(value, "application_label");
  if (!isAccountType(accountType)) return null;

  const dossierId = stringField(value, "dossier_id");
  const caseId = stringField(value, "case_id");
  const caseReference = stringField(value, "case_reference");
  const status = stringField(value, "status");
  if (
    !isUuid(dossierId) ||
    !isUuid(caseId) ||
    !CASE_REFERENCE_RE.test(caseReference) ||
    !status || !applicationLabel || applicationLabel.length > 120 ||
    (portalContext !== "customer" && portalContext !== "business") ||
    (accountType === "particulier"
      ? portalContext !== "customer"
      : portalContext !== "business")
  ) {
    return null;
  }

  return {
    dossier_id: dossierId,
    dossier_number: nullableStringField(value, "dossier_number"),
    account_type: accountType,
    portal_context: portalContext,
    status,
    document_changes_allowed: booleanField(value, "document_changes_allowed"),
    case_id: caseId,
    case_reference: caseReference,
    application_label: applicationLabel,
  };
}

function parseDossiers(value: unknown): DashboardDossierSummary[] | null {
  if (!Array.isArray(value)) return null;
  const dossiers = value.map(parseDossier);
  if (dossiers.some((item) => !item)) return null;
  return dossiers as DashboardDossierSummary[];
}

function parseLocation(value: unknown): DashboardLocation | null {
  if (!isRecord(value) || !isRecord(value.address)) return null;

  const locationId = stringField(value, "location_id");
  const status = stringField(value, "status");
  const postcode = stringField(value.address, "postcode");
  const houseNumber = stringField(value.address, "house_number");
  const country = stringField(value.address, "country");
  const declaredAddress = nullableStringField(value, "declared_address");
  if (
    !locationId || !status || !country ||
    (!declaredAddress && (!postcode || !houseNumber))
  ) {
    return null;
  }

  return {
    location_id: locationId,
    label: nullableStringField(value, "label"),
    status,
    declared_address: declaredAddress,
    address: {
      postcode,
      house_number: houseNumber,
      suffix: nullableStringField(value.address, "suffix"),
      street: nullableStringField(value.address, "street"),
      city: nullableStringField(value.address, "city"),
      country,
    },
  };
}

function parseCharger(value: unknown): DashboardCharger | null {
  if (!isRecord(value)) return null;
  const chargerId = stringField(value, "charger_id");
  const locationId = stringField(value, "location_id");
  const status = stringField(value, "status");
  const midNumber = nullableStringField(value, "mid_number");
  const midStatus = stringField(value, "mid_status");
  if (!chargerId || !locationId || !status || !midStatus) {
    return null;
  }

  return {
    charger_id: chargerId,
    location_id: locationId,
    status,
    brand: nullableStringField(value, "brand"),
    model: nullableStringField(value, "model"),
    serial_number: nullableStringField(value, "serial_number"),
    mid_number: midNumber,
    mid_status: midStatus,
    installation_year: numberField(value, "installation_year"),
    backend_supplier: nullableStringField(value, "backend_supplier"),
    solar_export_status: nullableStringField(value, "solar_export_status"),
  };
}

function parseDocumentSlot(value: unknown): DashboardDocumentSlot | null {
  if (!isRecord(value)) return null;
  const slotId = stringField(value, "document_slot_id");
  const documentType = stringField(value, "document_type");
  const title = stringField(value, "title");
  const status = stringField(value, "status");
  if (!slotId || !documentType || !title || !status) return null;

  return {
    document_slot_id: slotId,
    location_id: nullableStringField(value, "location_id"),
    charger_id: nullableStringField(value, "charger_id"),
    document_type: documentType,
    required: booleanField(value, "required"),
    title,
    status,
    current_version_number: numberField(value, "current_version_number"),
    current_file_name: nullableStringField(value, "current_file_name"),
  };
}

function parseLegalAcceptance(value: unknown): DashboardLegalAcceptance | null {
  if (!isRecord(value)) return null;
  const acceptanceType = stringField(value, "acceptance_type");
  const version = stringField(value, "version");
  const status = stringField(value, "status");
  if (!acceptanceType || !version || !status) return null;

  return {
    acceptance_type: acceptanceType,
    version,
    status,
    accepted_at: nullableStringField(value, "accepted_at"),
    active: booleanField(value, "active"),
  };
}

function parseTimelineEvent(value: unknown): DashboardTimelineEvent | null {
  if (
    !isRecord(value) || !hasExactKeys(value, [
      "event_id",
      "event_type",
      "occurred_at",
      "title",
      "text",
    ])
  ) return null;

  const eventId = stringField(value, "event_id");
  const eventType = stringField(value, "event_type");
  const occurredAt = stringField(value, "occurred_at");
  const title = stringField(value, "title");
  const text = stringField(value, "text");
  if (
    !TIMELINE_EVENT_ID_RE.test(eventId) ||
    !isTimelineEventType(eventType) ||
    !isUtcTimestamp(occurredAt) || !title || !text
  ) return null;

  return {
    event_id: eventId,
    event_type: eventType,
    occurred_at: occurredAt,
    title,
    text,
  };
}

function timelineIsOrdered(events: DashboardTimelineEvent[]): boolean {
  if (new Set(events.map((event) => event.event_id)).size !== events.length) {
    return false;
  }
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    if (previous.occurred_at < current.occurred_at) return false;
    if (previous.occurred_at !== current.occurred_at) continue;
    const previousPriority = TIMELINE_PHASE_PRIORITY[previous.event_type];
    const currentPriority = TIMELINE_PHASE_PRIORITY[current.event_type];
    if (previousPriority < currentPriority) return false;
    if (
      previousPriority === currentPriority &&
      previous.event_id > current.event_id
    ) return false;
  }
  return true;
}

function parseArray<T>(
  value: unknown,
  parser: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parser);
  if (parsed.some((item) => !item)) return null;
  return parsed as T[];
}

function validateDashboardBody(body: unknown): DashboardReadResult {
  if (
    !isRecord(body) || body.ok !== true || body.mode !== "dashboard_read_v1"
  ) {
    return { ok: false, error: safeDashboardError("invalid_response") };
  }

  const dossiers = parseDossiers(body.dossiers);
  const selectedDossier = parseDossier(body.selected_dossier);
  const locations = parseArray(body.locations, parseLocation);
  const chargers = parseArray(body.chargers, parseCharger);
  const documentSlots = parseArray(body.document_slots, parseDocumentSlot);
  const legalAcceptances = parseArray(
    body.legal_acceptances,
    parseLegalAcceptance,
  );
  const timeline = parseArray(body.timeline, parseTimelineEvent);
  const requestId = stringField(body, "request_id");

  if (
    !dossiers || !selectedDossier || !locations || !chargers ||
    !documentSlots || !legalAcceptances || !timeline || timeline.length > 50 ||
    !timelineIsOrdered(timeline) || !requestId
  ) {
    return { ok: false, error: safeDashboardError("invalid_response") };
  }

  return {
    ok: true,
    model: {
      request_id: requestId,
      dossiers,
      selected_dossier: selectedDossier,
      locations,
      chargers,
      document_slots: documentSlots,
      legal_acceptances: legalAcceptances,
      timeline,
    },
  };
}

function validateApplicationsBody(body: unknown): DashboardApplicationsResult {
  if (
    !isRecord(body) || body.ok !== true ||
    body.mode !== "dashboard_application_index_v1"
  ) {
    return { ok: false, error: safeDashboardError("invalid_response") };
  }

  const applications = parseDossiers(body.applications);
  const requestId = stringField(body, "request_id");
  if (
    !applications || !requestId ||
    new Set(applications.map((application) => application.case_reference))
        .size !==
      applications.length
  ) {
    return { ok: false, error: safeDashboardError("invalid_response") };
  }

  return {
    ok: true,
    model: { request_id: requestId, applications },
  };
}

async function parseJsonResponse(
  response: Response,
): Promise<
  { ok: true; body: unknown } | { ok: false; error: DashboardReadSafeError }
> {
  try {
    return { ok: true, body: await response.json() };
  } catch (_error) {
    return { ok: false, error: safeDashboardError("invalid_response") };
  }
}

async function postDashboardRequest({
  accessToken,
  body,
  fetchImpl,
  runtimeConfig,
  signal,
}: {
  accessToken: string;
  body: Record<string, string>;
  fetchImpl: typeof fetch;
  runtimeConfig?: { dashboardEndpointUrl: string; anonKey: string };
  signal?: AbortSignal;
}): Promise<
  | { ok: true; body: unknown }
  | { ok: false; error: DashboardReadSafeError; status?: number }
> {
  const runtime = runtimeConfig
    ? {
      ok: true as const,
      anonKey: runtimeConfig.anonKey,
      dashboardEndpointUrl: runtimeConfig.dashboardEndpointUrl,
    }
    : resolveAuthRuntimeConfig();
  if (!runtime.ok) {
    return { ok: false, error: safeDashboardError("not_configured") };
  }

  const bearerToken = accessToken.trim();
  if (!bearerToken) {
    return { ok: false, error: safeDashboardError("invalid_response") };
  }

  let response: Response;
  try {
    response = await fetchImpl(runtime.dashboardEndpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        apikey: runtime.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: safeDashboardError("service_unavailable") };
    }
    return { ok: false, error: safeDashboardError("service_unavailable") };
  }

  const parsed = await parseJsonResponse(response);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: response.status };
  }
  if (!response.ok) {
    const code = isRecord(parsed.body) ? stringField(parsed.body, "code") : "";
    return {
      ok: false,
      error: mapDashboardErrorCode(code),
      status: response.status,
    };
  }
  return { ok: true, body: parsed.body };
}

export async function fetchDashboardReadModel({
  accessToken,
  dossierId,
  fetchImpl = fetch,
  runtimeConfig,
  signal,
}: DashboardReadConfig): Promise<DashboardReadResult> {
  const selectedDossierId = dossierId.trim();
  if (!selectedDossierId) {
    return { ok: false, error: safeDashboardError("invalid_response") };
  }
  const response = await postDashboardRequest({
    accessToken,
    body: { dossier_id: selectedDossierId },
    fetchImpl,
    runtimeConfig,
    signal,
  });
  return response.ok ? validateDashboardBody(response.body) : response;
}

export async function fetchDashboardApplications({
  accessToken,
  fetchImpl = fetch,
  runtimeConfig,
  signal,
}: DashboardApplicationsConfig): Promise<DashboardApplicationsResult> {
  const response = await postDashboardRequest({
    accessToken,
    body: { mode: "applications" },
    fetchImpl,
    runtimeConfig,
    signal,
  });
  return response.ok ? validateApplicationsBody(response.body) : response;
}
