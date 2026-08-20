import { renderToStaticMarkup } from "react-dom/server";
import { ActivePrivateDashboard } from "./ActivePrivateDashboard.tsx";
import {
  type CustomerCorrectionHandoffModel,
  type CustomerCorrectionHandoffResult,
  decodeCustomerCorrectionHandoffResponse,
  fetchCustomerCorrectionHandoff,
} from "./customerCorrectionHandoffClient.ts";
import {
  clearCustomerCorrectionHandoffCache,
  type CustomerCorrectionHandoffState,
  loadCustomerCorrectionHandoffOnce,
} from "./useCustomerCorrectionHandoff.ts";
import {
  customerCorrectionReasonLabel,
} from "./CustomerCorrectionHandoffPanel.tsx";
import type { DashboardReadState } from "./useDashboardRead.ts";
import type {
  DashboardDossierSummary,
  DashboardReadModel,
} from "./dashboardTypes.ts";

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const CASE_A = "CASE-7E4CC75CD19F";
const CASE_B = "CASE-111111111111";
const DOSSIER_A = "11111111-1111-4111-8111-111111111111";
const DOSSIER_B = "22222222-2222-4222-8222-222222222222";
const root = new URL("../../../../", import.meta.url);

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, root));
}

function item(
  correctionReason:
    | "MISSING_INFORMATION"
    | "INCORRECT_INFORMATION"
    | "INCONSISTENT_INFORMATION"
    | "OTHER" = "INCORRECT_INFORMATION",
  itemNumber = 1,
) {
  const serverLabels = {
    MISSING_INFORMATION: "Gegeven ontbreekt",
    INCORRECT_INFORMATION: "Gegeven onjuist",
    INCONSISTENT_INFORMATION: "Gegevens inconsistent",
    OTHER: "Aanpassing nodig",
  } as const;
  return {
    itemRef: `CCI-${itemNumber.toString(16).padStart(32, "0").toUpperCase()}`,
    documentLabel: "Energiedocument",
    factLabel: "Energieleverancier",
    ...(correctionReason === "MISSING_INFORMATION"
      ? {}
      : { currentValue: "Pilot Energie Nederland B.V." }),
    correctionReason,
    correctionReasonLabel: serverLabels[correctionReason],
    correctionInstruction: "foute invoer",
    responseRequirement: correctionReason === "MISSING_INFORMATION"
      ? "MISSING_VALUE"
      : "VALUE_CORRECTION",
  };
}

function body(caseRef = CASE_A, items: unknown[] = [item()]) {
  return {
    schemaVersion: "customer-correction-handoff-v2",
    caseRef,
    handoff: {
      handoffRef: "CRH-0123456789ABCDEF",
      publishedAt: "2026-08-19T14:54:34.880Z",
      items,
    },
  };
}

function handoffModel(caseRef = CASE_A): CustomerCorrectionHandoffModel {
  const decoded = decodeCustomerCorrectionHandoffResponse(
    body(caseRef),
    caseRef,
  );
  assert(decoded.ok, "proof_handoff_invalid");
  return decoded.model;
}

function dossier(
  dossierId = DOSSIER_A,
  caseRef = CASE_A,
): DashboardDossierSummary {
  return {
    dossier_id: dossierId,
    dossier_number: null,
    account_type: "particulier",
    status: "submitted_for_review",
    document_changes_allowed: false,
    case_id: dossierId,
    case_reference: caseRef,
  };
}

function dashboardModel(): DashboardReadModel {
  const selected = dossier();
  return {
    request_id: "customer02-proof",
    dossiers: [selected],
    selected_dossier: selected,
    locations: [],
    chargers: [],
    document_slots: [],
    legal_acceptances: [],
  };
}

const dashboardRead: DashboardReadState = {
  status: "ready",
  model: dashboardModel(),
  error: null,
  retry: () => undefined,
  refreshSelectedDossier: async () => true,
};

function renderDashboard(correctionHandoff: CustomerCorrectionHandoffState) {
  return renderToStaticMarkup(
    <ActivePrivateDashboard
      accessToken="proof-token"
      correctionHandoff={correctionHandoff}
      dashboardRead={dashboardRead}
      dossierOptions={[dossier()]}
      onRefreshSelectedDossier={async () => true}
      onSelectDossier={() => undefined}
      onStartNewApplication={() => undefined}
      selectedDossierId={DOSSIER_A}
    />,
  );
}

const decoded = decodeCustomerCorrectionHandoffResponse(body(), CASE_A);
assert(
  decoded.ok && decoded.model.handoff?.items.length === 1 &&
    decoded.model.handoff.items[0].correctionReason ===
      "INCORRECT_INFORMATION" &&
    decoded.model.handoff.items[0].responseRequirement ===
      "VALUE_CORRECTION" &&
    decoded.model.handoff.items[0].currentValue ===
      "Pilot Energie Nederland B.V.",
  "Q01_customer_safe_response_not_decoded",
);
const noHandoff = decodeCustomerCorrectionHandoffResponse({
  schemaVersion: "customer-correction-handoff-v2",
  caseRef: CASE_A,
  handoff: null,
}, CASE_A);
assert(
  noHandoff.ok && noHandoff.model.handoff === null,
  "Q02_no_handoff_not_decoded",
);
assert(
  !decodeCustomerCorrectionHandoffResponse({
    ...body(),
    subjectRef: "internal",
  }, CASE_A).ok &&
    !decodeCustomerCorrectionHandoffResponse(body(CASE_B), CASE_A).ok &&
    !decodeCustomerCorrectionHandoffResponse(
      body(CASE_A, [{
        ...item(),
        evidenceVersionRef: "internal",
      }]),
      CASE_A,
    ).ok &&
    !decodeCustomerCorrectionHandoffResponse(
      body(CASE_A, [{
        ...item(),
        correctionReason: "UNCLASSIFIED",
      }]),
      CASE_A,
    ).ok,
  "Q03_unknown_or_internal_response_not_rejected",
);

let requestCount = 0;
const fetched = await fetchCustomerCorrectionHandoff({
  accessToken: "proof-token",
  caseRef: CASE_A,
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async (input, init) => {
    requestCount += 1;
    const headers = new Headers(init?.headers);
    assert(
      String(input) ===
          `https://local.invalid/functions/v1/api-app-customer-correction-handoff?caseRef=${CASE_A}` &&
        init?.method === "GET" && init.body === undefined &&
        headers.get("Authorization") === "Bearer proof-token" &&
        headers.get("apikey") === "proof-anon",
      "Q04_authenticated_exact_case_get_invalid",
    );
    return new Response(JSON.stringify(body()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
assert(
  fetched.ok && requestCount === 1,
  "Q04_authenticated_exact_case_get_invalid",
);

clearCustomerCorrectionHandoffCache();
let cachedFetchCount = 0;
const fetcher = async (
  { caseRef }: { accessToken: string; caseRef: string },
): Promise<CustomerCorrectionHandoffResult> => {
  cachedFetchCount += 1;
  await Promise.resolve();
  return { ok: true, model: handoffModel(caseRef) };
};
const [firstLoad, strictModeLoad] = await Promise.all([
  loadCustomerCorrectionHandoffOnce({
    accessToken: "proof-token",
    cacheScope: "principal-a",
    caseRef: CASE_A,
    fetcher,
  }),
  loadCustomerCorrectionHandoffOnce({
    accessToken: "proof-token",
    cacheScope: "principal-a",
    caseRef: CASE_A,
    fetcher,
  }),
]);
await loadCustomerCorrectionHandoffOnce({
  accessToken: "proof-token",
  cacheScope: "principal-a",
  caseRef: CASE_A,
  fetcher,
});
assert(
  cachedFetchCount === 1 && firstLoad === strictModeLoad,
  "Q05_strictmode_duplicate_get_not_deduplicated",
);
await loadCustomerCorrectionHandoffOnce({
  accessToken: "proof-token",
  cacheScope: "principal-a",
  caseRef: CASE_B,
  fetcher,
});
assert(
  Number(cachedFetchCount) === 2,
  "Q06_selected_case_replacement_get_invalid",
);

const denied = await fetchCustomerCorrectionHandoff({
  accessToken: "proof-token",
  caseRef: CASE_A,
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        ok: false,
        code: "customer_case_access_denied",
        error: "Dossier niet gevonden.",
      }),
      { status: 404 },
    ),
});
assert(
  !denied.ok && denied.error.code === "inaccessible" &&
    !JSON.stringify(denied).includes("customer_case_access_denied"),
  "Q07_access_denial_not_safe",
);

const noHandoffHtml = renderDashboard({
  status: "ready",
  model: noHandoff.ok ? noHandoff.model : handoffModel(),
  error: null,
  retry: () => undefined,
});
assert(
  noHandoffHtml.includes("In behandeling") &&
    !noHandoffHtml.includes("Aanpassing nodig"),
  "Q08_no_handoff_changed_existing_status",
);
const publishedHtml = renderDashboard({
  status: "ready",
  model: handoffModel(),
  error: null,
  retry: () => undefined,
});
assert(
  publishedHtml.includes("Aanpassing nodig") &&
    publishedHtml.includes("Energiedocument") &&
    publishedHtml.includes("Energieleverancier") &&
    publishedHtml.includes("Gegeven onjuist") &&
    publishedHtml.includes("foute invoer") &&
    !publishedHtml.includes("WAITING_CUSTOMER"),
  "Q09_published_handoff_not_rendered_safely",
);

const multiple = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    item("MISSING_INFORMATION", 1),
    item("INCONSISTENT_INFORMATION", 2),
    item("OTHER", 3),
  ]),
  CASE_A,
);
assert(multiple.ok, "multiple_items_invalid");
const multipleHtml = renderDashboard({
  status: "ready",
  model: multiple.model,
  error: null,
  retry: () => undefined,
});
assert(
  (multipleHtml.match(/class="portal-evidence-card"/g) || []).length === 3 &&
    multipleHtml.indexOf("Gegeven ontbreekt") <
      multipleHtml.indexOf("Gegevens komen niet overeen") &&
    multipleHtml.indexOf("Gegevens komen niet overeen") <
      multipleHtml.indexOf("Anders") &&
    customerCorrectionReasonLabel("INCORRECT_INFORMATION") ===
      "Gegeven onjuist",
  "Q10_multiple_items_or_reason_mapping_invalid",
);

const errorHtml = renderDashboard({
  status: "error",
  model: null,
  error: {
    code: "inaccessible",
    message: "De dossieractie is niet beschikbaar voor dit account.",
  },
  retry: () => undefined,
});
assert(
  errorHtml.includes("Dossieractie niet beschikbaar") &&
    errorHtml.includes("Opnieuw proberen") &&
    errorHtml.includes("In behandeling") &&
    !errorHtml.includes("Energieleverancier") &&
    !errorHtml.includes("Aanpassing nodig"),
  "Q11_error_not_isolated_or_safe",
);

const [clientSource, hookSource, panelSource, dashboardSource, shellSource] =
  await Promise.all([
    source("app/src/features/dashboard/customerCorrectionHandoffClient.ts"),
    source("app/src/features/dashboard/useCustomerCorrectionHandoff.ts"),
    source("app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx"),
    source("app/src/features/dashboard/ActivePrivateDashboard.tsx"),
    source("app/src/features/dashboard/DashboardPageShell.tsx"),
  ]);
assert(
  clientSource.includes("api-app-customer-correction-handoff?caseRef=") &&
    clientSource.includes('method: "GET"') &&
    !/(email|customerId|customer_id)/.test(clientSource) &&
    shellSource.includes("selectedCaseRef") &&
    shellSource.includes("effectiveDossierId") &&
    hookSource.includes("requestKeyRef.current !== requestKey") &&
    hookSource.includes("customerCorrectionHandoffSafeError(code)") &&
    !hookSource.includes("error.message") &&
    !hookSource.includes("setInterval") && !hookSource.includes("setTimeout"),
  "Q12_selected_case_authority_or_stale_guard_invalid",
);
assert(
  !panelSource.includes("dangerouslySetInnerHTML") &&
    !/(subjectRef|workforce|reviewer|manifest|evidenceVersionRef|fraud|security)/i
      .test(panelSource) &&
    !publishedHtml.match(/>(Wijzigen|Corrigeren|Opslaan|Upload|Versturen)</) &&
    !dashboardSource.includes("style={{") && !panelSource.includes("style={{"),
  "Q13_internal_metadata_mutation_control_or_inline_css_present",
);

console.log("CUSTOMER_CORRECTION_HANDOFF_UI_Q01_Q13=PASS");
Deno.exit(0);
