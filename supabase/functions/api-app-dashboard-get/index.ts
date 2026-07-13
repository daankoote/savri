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
  insertAppAuditFailOpen,
} from "../_shared/app_foundation.ts";
import {
  requireAppCustomer,
  requireAppDossierAccess,
  type AppCustomerAuthContext,
} from "../_shared/app_customer_auth.ts";

type DashboardPayload = {
  dossier_id?: unknown;
};

type DossierRow = {
  id?: string;
  dossier_number?: string | null;
  account_type?: string | null;
  status?: string | null;
  created_at?: string | null;
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
  status: string;
};

type SafeSelectedDossier = SafeDossier;

type SafeLocation = {
  location_id: string;
  label: string | null;
  status: string;
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
  mid_number: string;
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
};

type NormalizedPayload = {
  dossier_id: string;
};

type NormalizationError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

const MODE = "dashboard_read_v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

function safeDossierNumber(value: unknown): string | null {
  const dossierNumber = getString(value);
  return dossierNumber || null;
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

function normalizePayload(body: DashboardPayload): { ok: true; payload: NormalizedPayload } | NormalizationError {
  const keys = Object.keys(body);
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

  return { ok: true, payload: { dossier_id: dossierId } };
}

async function auditScopedReject(
  SB: any,
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  authContext: AppCustomerAuthContext | null,
  dossierId: string | null,
  reason: string,
  stage: string,
) {
  if (!authContext) return;

  await insertAppAuditFailOpen(SB, {
    event_type: "dashboard_read_rejected",
    scope_type: dossierId ? "dossier" : "customer",
    scope_id: dossierId,
    customer_id: authContext.customerId,
    dossier_id: dossierId,
    actor_type: "customer",
    actor_ref: authContext.actorRef,
    event_data: {
      stage,
      reason,
    },
  }, meta);
}

function mapDossier(row: DossierRow): SafeDossier | null {
  const id = getString(row.id);
  const accountType = getString(row.account_type);
  const status = getString(row.status);
  if (!isUuid(id) || !ACCOUNT_TYPES.has(accountType) || !status) return null;

  return {
    dossier_id: id,
    dossier_number: safeDossierNumber(row.dossier_number),
    account_type: accountType as SafeDossier["account_type"],
    status,
  };
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
  if (!isUuid(id) || !isUuid(locationId) || !status || !midNumber || !midStatus) return null;

  return {
    charger_id: id,
    location_id: locationId,
    status,
    brand: firstLabel(row.manual_brand, row.brand_label, row.brand_id),
    model: firstLabel(row.manual_model, row.model_label, row.model_id),
    serial_number: nullString(row.serial_number),
    mid_number: midNumber,
    mid_status: midStatus,
    installation_year: Number.isInteger(row.installation_year) ? Number(row.installation_year) : null,
    backend_supplier: firstLabel(row.manual_backend_supplier, row.backend_supplier_label, row.backend_supplier_id),
    solar_export_status: nullString(row.solar_export_status),
  };
}

function mapDocumentSlot(row: DocumentSlotRow, fileNamesByVersionId: Map<string, string>): SafeDocumentSlot | null {
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
    current_version_number: Number.isInteger(row.current_version_number) ? Number(row.current_version_number) : null,
    current_file_name: currentVersionId ? fileNamesByVersionId.get(currentVersionId) || null : null,
  };
}

function mapLegalAcceptance(row: LegalAcceptanceRow): SafeLegalAcceptance | null {
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

  const versionRows = (Array.isArray(versions) ? versions : []) as DocumentVersionRow[];
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
    const fileName = firstLabel(file.original_file_name, file.normalized_file_name);
    if (isUuid(fileId) && fileName) fileNamesByFileId.set(fileId, fileName);
  }

  const fileNamesByVersionId = new Map<string, string>();
  for (const version of versionRows) {
    const versionId = getString(version.id);
    const fileId = getString(version.document_file_id);
    const fileName = fileNamesByFileId.get(fileId);
    if (isUuid(versionId) && fileName) fileNamesByVersionId.set(versionId, fileName);
  }

  return fileNamesByVersionId;
}

async function loadDashboardReadModel(
  SB: any,
  customerId: string,
  dossierId: string,
): Promise<Omit<DashboardResponse, "ok" | "mode" | "request_id">> {
  const dossierSelect = "id,dossier_number,account_type,status,created_at";

  const allDossiersPromise = SB
    .from("app_customer_dossiers")
    .select(dossierSelect)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  const selectedDossierPromise = SB
    .from("app_customer_dossiers")
    .select(dossierSelect)
    .eq("id", dossierId)
    .maybeSingle();

  const locationsPromise = SB
    .from("app_dossier_locations")
    .select("id,client_location_id,label,status,postcode_normalized,house_number,suffix_normalized,street,city,country,created_at")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });

  const chargersPromise = SB
    .from("app_dossier_chargers")
    .select("id,location_id,client_charger_id,status,brand_id,brand_label,manual_brand,model_id,model_label,manual_model,serial_number,mid_number,mid_status,backend_supplier_id,backend_supplier_label,manual_backend_supplier,installation_year,solar_export_status,created_at")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });

  const slotsPromise = SB
    .from("app_dossier_document_slots")
    .select("id,location_id,charger_id,document_type,status,required,title,current_version_id,current_version_number,created_at")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });

  const acceptancesPromise = SB
    .from("app_dossier_legal_acceptances")
    .select("acceptance_type,status,version_ref,accepted_at,created_at")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });

  const [
    allDossiersResult,
    selectedDossierResult,
    locationsResult,
    chargersResult,
    slotsResult,
    acceptancesResult,
  ] = await Promise.all([
    allDossiersPromise,
    selectedDossierPromise,
    locationsPromise,
    chargersPromise,
    slotsPromise,
    acceptancesPromise,
  ]);

  if (allDossiersResult.error || selectedDossierResult.error || locationsResult.error || chargersResult.error || slotsResult.error || acceptancesResult.error) {
    throw new Error("dashboard_read_failed");
  }

  const dossiers = ((Array.isArray(allDossiersResult.data) ? allDossiersResult.data : []) as DossierRow[])
    .map(mapDossier)
    .filter((row): row is SafeDossier => !!row);

  const selectedDossier = mapDossier((selectedDossierResult.data || {}) as DossierRow);
  if (!selectedDossier) throw new Error("selected_dossier_projection_failed");

  const locationRows = (Array.isArray(locationsResult.data) ? locationsResult.data : []) as LocationRow[];
  const chargerRows = (Array.isArray(chargersResult.data) ? chargersResult.data : []) as ChargerRow[];
  const slotRows = (Array.isArray(slotsResult.data) ? slotsResult.data : []) as DocumentSlotRow[];
  const acceptanceRows = (Array.isArray(acceptancesResult.data) ? acceptancesResult.data : []) as LegalAcceptanceRow[];

  const fileNamesByVersionId = await loadCurrentFileNamesByVersionId(SB, dossierId, slotRows);

  return {
    dossiers,
    selected_dossier: selectedDossier,
    locations: locationRows.map(mapLocation).filter((row): row is SafeLocation => !!row),
    chargers: chargerRows.map(mapCharger).filter((row): row is SafeCharger => !!row),
    document_slots: slotRows.map((row) => mapDocumentSlot(row, fileNamesByVersionId)).filter((row): row is SafeDocumentSlot => !!row),
    legal_acceptances: acceptanceRows.map(mapLegalAcceptance).filter((row): row is SafeLegalAcceptance => !!row),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);

  if (req.method !== "POST") {
    return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");
  }

  const normalized = normalizePayload(parsed.body);
  if (!normalized.ok) {
    return appErrorResponse(req, normalized.status, normalized.message, normalized.code);
  }

  const SB = appSupabaseClient();
  if (!SB) {
    return appErrorResponse(req, 503, "Dashboard is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const authResult = await requireAppCustomer(req, SB);
  if (!authResult.ok) {
    return appErrorResponse(req, authResult.status, authResult.message, authResult.code);
  }

  const accessResult = await requireAppDossierAccess(SB, authResult.context, normalized.payload.dossier_id);
  if (!accessResult.ok) {
    await auditScopedReject(
      SB,
      meta,
      authResult.context,
      normalized.payload.dossier_id,
      accessResult.code,
      "dossier_access",
    );
    return appErrorResponse(req, accessResult.status, accessResult.message, accessResult.code);
  }

  try {
    const readModel = await loadDashboardReadModel(
      SB,
      authResult.context.customerId,
      accessResult.dossier.dossierId,
    );

    const response: DashboardResponse = {
      ok: true,
      mode: MODE,
      request_id: meta.request_id,
      ...readModel,
    };

    return appJsonResponse(req, 200, response);
  } catch (_error) {
    await auditScopedReject(
      SB,
      meta,
      authResult.context,
      accessResult.dossier.dossierId,
      "dashboard_read_failed",
      "read_model",
    );
    return appErrorResponse(req, 503, "Dashboard is tijdelijk niet beschikbaar.", "service_unavailable");
  }
});
