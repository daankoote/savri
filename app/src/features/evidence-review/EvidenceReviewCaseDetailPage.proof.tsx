import { renderToStaticMarkup } from "react-dom/server";
import type {
  EvidenceReviewCaseDetailResponseV1,
  EvidenceReviewEvidenceV1,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import {
  beginEvidencePreview,
  completeEvidencePreview,
  EvidenceReviewCaseDetailContent,
} from "./EvidenceReviewCaseDetailPage.tsx";
import {
  decodeEvidenceReviewCaseDetailResponse,
  type EvidenceReviewDetailSafeError,
  loadEvidenceReviewCaseDetail,
  openEvidenceReviewPreview,
} from "./evidenceReviewDetailClient.ts";
import { loadEvidenceReviewCaseDetailOnce } from "./useEvidenceReviewCaseDetail.ts";
import {
  buildEvidenceReviewDetailRoute,
  parseEvidenceReviewDetailRoute,
} from "./evidenceReviewRoutes.ts";

class ProofFailure extends Error {}

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));
const CASE_REF = "CASE-7E4CC75CD19F";
const ENERGY_VERSION = "e8000000-0000-4000-8000-000000000001";
const INSTALLATION_VERSION = "e8000000-0000-4000-8000-000000000002";
const noop = () => undefined;

function evidence(
  evidenceVersionRef: string,
  kind: string,
  facts: EvidenceReviewEvidenceV1["canonicalFacts"],
): EvidenceReviewEvidenceV1 {
  return {
    evidenceRef: crypto.randomUUID(),
    evidenceVersionRef,
    kind,
    mime: "application/pdf",
    uploadedAt: "2026-08-18T10:00:00.000Z",
    integrityAvailable: true,
    reviewStatus: "PENDING",
    canonicalFacts: facts,
  };
}

const FIXTURE: EvidenceReviewCaseDetailResponseV1 = {
  schemaVersion: "evidence-review-case-detail-v1",
  asOf: "2026-08-18T12:00:00.000Z",
  case: {
    caseRef: CASE_REF,
    lifecycle: "submitted_for_review",
    partyDisplayName: "Pilotnaam",
    partyDisplayNameTruth: "DECLARED",
    deliveryAddress: "Pilotadres",
    deliveryAddressTruth: "DECLARED",
  },
  evidence: [
    evidence(ENERGY_VERSION, "energy_bill_or_contract", [
      {
        category: "EAN",
        value: "871234567890123456",
        truthClass: "REVIEW_REQUIRED",
      },
      {
        category: "ENERGY_SUPPLIER",
        value: "Leverancier",
        truthClass: "CUSTOMER_CONFIRMED",
      },
    ]),
    evidence(INSTALLATION_VERSION, "installation_invoice", [
      {
        category: "CHARGER_BRAND",
        value: "Merk",
        truthClass: "CUSTOMER_CONFIRMED",
      },
      {
        category: "MID",
        value: "MID-verklaard",
        truthClass: "REVIEW_REQUIRED",
      },
    ]),
  ],
};

const previewSuccess = async () => ({
  ok: true as const,
  opened: true as const,
  filename: "proof.pdf",
  expiresAt: "2026-08-18T12:02:00.000Z",
});

function detailHtml(
  state:
    | { status: "loading"; value: null; error: null }
    | {
      status: "ready";
      value: EvidenceReviewCaseDetailResponseV1;
      error: null;
    }
    | { status: "error"; value: null; error: EvidenceReviewDetailSafeError },
): string {
  return renderToStaticMarkup(
    <EvidenceReviewCaseDetailContent
      caseRef={CASE_REF}
      onBack={noop}
      onPreview={previewSuccess}
      onRefresh={noop}
      state={state}
    />,
  );
}

const detailRoute = buildEvidenceReviewDetailRoute(CASE_REF);
assert(
  detailRoute === `/intern/dossiers/${CASE_REF}` &&
    parseEvidenceReviewDetailRoute(detailRoute) === CASE_REF,
  "Q01_valid_detail_route_rejected",
);
for (
  const invalid of [
    "/intern/dossiers/CASE-NOT-HEX",
    `/intern/dossiers/${CASE_REF}/extra`,
    `/intern/dossiers/${CASE_REF}?tenant=other`,
    "/intern/dossiers/../compliance",
    `https://attacker.invalid/intern/dossiers/${CASE_REF}`,
    `//attacker.invalid/intern/dossiers/${CASE_REF}`,
  ]
) {
  assert(
    parseEvidenceReviewDetailRoute(invalid) === null,
    `Q02_invalid_route:${invalid}`,
  );
}

const loadingHtml = detailHtml({ status: "loading", value: null, error: null });
assert(
  loadingHtml.includes("Dossier laden") &&
    loadingHtml.includes('role="status"') &&
    loadingHtml.includes("Terug naar dossiers"),
  "Q03_loading_or_back_state_invalid",
);

const readyHtml = detailHtml({ status: "ready", value: FIXTURE, error: null });
assert(
  readyHtml.includes(CASE_REF) &&
    readyHtml.includes("Ingediend voor beoordeling") &&
    readyHtml.includes("Pilotnaam") && readyHtml.includes("Pilotadres") &&
    readyHtml.split("Document bekijken").length - 1 === 2 &&
    readyHtml.split(">PENDING<").length - 1 === 2,
  "Q04_pilot_detail_or_two_evidence_cards_invalid",
);
assert(
  readyHtml.includes("EAN") && readyHtml.includes("871234567890123456") &&
    readyHtml.includes("Energieleverancier") &&
    readyHtml.includes("Door klant bevestigd") &&
    readyHtml.includes("Beoordeling nodig") &&
    !/(workforce accepted|door medewerker geaccepteerd|parserhistorie|parser history)/i
      .test(readyHtml),
  "Q05_fact_truth_presentation_invalid",
);
assert(
  !/(Accepteren|Correctie vereist maken|Beoordeling opslaan|Check uitvoeren)/i
    .test(readyHtml),
  "Q06_decision_or_check_control_present",
);

const unauthorizedHtml = detailHtml({
  status: "error",
  value: null,
  error: {
    code: "unauthorized",
    message: "Log opnieuw in om dit dossier te bekijken.",
  },
});
const inaccessibleHtml = detailHtml({
  status: "error",
  value: null,
  error: {
    code: "not_found_or_forbidden",
    message:
      "Dit dossier is niet beschikbaar binnen uw toegewezen dossierscope.",
  },
});
const invalidHtml = detailHtml({
  status: "error",
  value: null,
  error: { code: "invalid_case", message: "De dossierroute is ongeldig." },
});
const serverErrorHtml = detailHtml({
  status: "error",
  value: null,
  error: {
    code: "service_unavailable",
    message: "Tijdelijk niet beschikbaar.",
  },
});
assert(
  unauthorizedHtml.includes("Inloggen vereist") &&
    inaccessibleHtml.includes("Dossier niet beschikbaar") &&
    invalidHtml.includes("Ongeldige dossierroute") &&
    serverErrorHtml.includes("Opnieuw laden") &&
    !inaccessibleHtml.includes("bestaat") &&
    !/(postgres|service[_ .-]?role|credential|workforce_identity)/i.test(
      unauthorizedHtml + inaccessibleHtml + invalidHtml + serverErrorHtml,
    ),
  "Q07_safe_error_states_invalid",
);

let detailFetches = 0;
let detailUrl = "";
let detailInit: RequestInit | undefined;
const detailResult = await loadEvidenceReviewCaseDetail({
  accessToken: "proof-access-token",
  caseRef: CASE_REF,
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
  fetchImpl: async (input, init) => {
    detailFetches += 1;
    detailUrl = String(input);
    detailInit = init;
    return new Response(JSON.stringify(FIXTURE), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
const detailHeaders = new Headers(detailInit?.headers);
assert(
  detailResult.ok && detailFetches === 1 &&
    detailUrl ===
      `https://local-proof.invalid/functions/v1/api-app-evidence-review-case-detail?caseRef=${CASE_REF}` &&
    detailInit?.method === "GET" && !detailInit.body &&
    detailHeaders.get("authorization") === "Bearer proof-access-token" &&
    detailHeaders.get("apikey") === "proof-anon-key",
  "Q08_exact_single_detail_get_invalid",
);

let dedupedFetches = 0;
let releaseDedupedFetch: () => void = () => {
  throw new ProofFailure("dedupe_release_not_initialized");
};
const dedupedFetchImpl: typeof fetch = async () => {
  dedupedFetches += 1;
  await new Promise<void>((resolve) => {
    releaseDedupedFetch = resolve;
  });
  return new Response(JSON.stringify(FIXTURE), { status: 200 });
};
const dedupeConfig = {
  accessToken: "strict-mode-proof-token",
  caseRef: CASE_REF,
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
  fetchImpl: dedupedFetchImpl,
};
const firstStrictModeRead = loadEvidenceReviewCaseDetailOnce(dedupeConfig);
const secondStrictModeRead = loadEvidenceReviewCaseDetailOnce(dedupeConfig);
await Promise.resolve();
assert(
  firstStrictModeRead === secondStrictModeRead && dedupedFetches === 1 &&
    typeof releaseDedupedFetch === "function",
  "Q08b_strict_mode_initial_read_not_deduplicated",
);
releaseDedupedFetch();
assert(
  (await firstStrictModeRead).ok && (await secondStrictModeRead).ok,
  "Q08c_deduped_read_failed",
);
await loadEvidenceReviewCaseDetailOnce({
  ...dedupeConfig,
  fetchImpl: async () => {
    dedupedFetches += 1;
    return new Response(JSON.stringify(FIXTURE), { status: 200 });
  },
});
assert((dedupedFetches as number) === 2, "Q08d_explicit_later_read_not_fresh");

let previewFetches = 0;
let previewUrl = "";
let openedUrl = "";
assert(previewFetches === 0, "Q09_eager_preview_request_present");
const previewResult = await openEvidenceReviewPreview({
  accessToken: "proof-access-token",
  caseRef: CASE_REF,
  evidenceVersionRef: ENERGY_VERSION,
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
  fetchImpl: async (input) => {
    previewFetches += 1;
    previewUrl = String(input);
    return new Response(
      JSON.stringify({
        schemaVersion: "evidence-review-preview-v1",
        evidenceVersionRef: ENERGY_VERSION,
        filename: "energy.pdf",
        mimeType: "application/pdf",
        signedUrl:
          "https://local-proof.invalid/storage/v1/object/sign/private/file.pdf?token=secret",
        expiresAt: "2026-08-18T12:02:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
  openUrl: (url) => {
    openedUrl = url;
  },
});
assert(
  previewResult.ok && (previewFetches as number) === 1 &&
    previewUrl ===
      `https://local-proof.invalid/functions/v1/api-app-evidence-review-preview?caseRef=${CASE_REF}&evidenceVersionRef=${ENERGY_VERSION}` &&
    openedUrl.startsWith(
      "https://local-proof.invalid/storage/v1/object/sign/",
    ) &&
    !("signedUrl" in previewResult),
  "Q10_on_demand_exact_preview_get_invalid",
);

const failedPreview = completeEvidencePreview({
  ok: false,
  error: { code: "service_unavailable", message: "Preview mislukt." },
});
const retryPreview = beginEvidencePreview();
const completedPreview = completeEvidencePreview(await previewSuccess());
assert(
  failedPreview.status === "error" &&
    failedPreview.message === "Preview mislukt." &&
    retryPreview.status === "loading" && completedPreview.status === "idle",
  "Q11_preview_error_recovery_invalid",
);

for (const status of [403, 404]) {
  const result = await loadEvidenceReviewCaseDetail({
    accessToken: "proof-access-token",
    caseRef: CASE_REF,
    runtimeConfig: {
      anonKey: "proof-anon-key",
      apiBaseUrl: "https://local-proof.invalid/functions/v1",
    },
    fetchImpl: async () => new Response("{}", { status }),
  });
  assert(
    !result.ok && result.error.code === "not_found_or_forbidden" &&
      result.error.message ===
        "Dit dossier is niet beschikbaar binnen uw toegewezen dossierscope.",
    `Q12_inaccessible_status_not_collapsed:${status}`,
  );
}

assert(
  !decodeEvidenceReviewCaseDetailResponse({
    ...FIXTURE,
    storagePath: "private/path",
  }).ok &&
    !decodeEvidenceReviewCaseDetailResponse({
      ...FIXTURE,
      evidence: [{ ...FIXTURE.evidence[0], reviewStatus: "APPROVED" }],
    }).ok,
  "Q13_detail_decoder_not_fail_closed",
);

const [
  appSource,
  routeSource,
  navigationSource,
  guardSource,
  worklistSource,
  detailClientSource,
  detailHookSource,
  detailSource,
  pageSource,
  downloadSource,
  layoutCss,
  componentsCss,
  detailEndpointSource,
  previewEndpointSource,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/features/evidence-review/evidenceReviewRoutes.ts"),
  source("app/src/features/auth/postLoginNavigation.ts"),
  source("app/src/features/auth/DashboardRouteGuard.tsx"),
  source("app/src/features/evidence-review/EvidenceReviewWorklistPage.tsx"),
  source("app/src/features/evidence-review/evidenceReviewDetailClient.ts"),
  source("app/src/features/evidence-review/useEvidenceReviewCaseDetail.ts"),
  source("app/src/features/evidence-review/EvidenceReviewCaseDetailPage.tsx"),
  source("app/src/pages/EvidenceReviewCaseDetailPage.tsx"),
  source("app/src/features/documents/documentDownloadClient.ts"),
  source("app/src/styles/layout.css"),
  source("app/src/styles/components.css"),
  source("supabase/functions/api-app-evidence-review-case-detail/index.ts"),
  source("supabase/functions/api-app-evidence-review-preview/index.ts"),
]);
assert(
  appSource.includes("parseEvidenceReviewDetailRoute(path)") &&
    appSource.includes("EvidenceReviewCaseDetailPage") &&
    routeSource.includes("DETAIL_ROUTE_RE") &&
    pageSource.includes("DashboardRouteGuard") &&
    pageSource.includes("returnTo={currentPath}") &&
    guardSource.includes("buildInternalLoginRoute(returnTo)") &&
    navigationSource.includes("parseEvidenceReviewDetailRoute(value)"),
  "Q14_route_auth_return_or_refresh_boundary_invalid",
);
assert(
  worklistSource.includes("buildEvidenceReviewDetailRoute") &&
    worklistSource.includes("Dossier openen") &&
    detailClientSource.includes("api-app-evidence-review-case-detail") &&
    detailClientSource.includes("api-app-evidence-review-preview") &&
    detailHookSource.split("loadEvidenceReviewCaseDetail(config)").length -
          1 === 1 &&
    detailHookSource.includes("IN_FLIGHT_DETAIL_READS") &&
    detailHookSource.includes("loadEvidenceReviewCaseDetailOnce") &&
    !detailHookSource.includes("setInterval") &&
    !detailHookSource.includes("setTimeout"),
  "Q15_one_load_no_polling_or_navigation_invalid",
);
assert(
  detailSource.includes("useState<PreviewState>") &&
    detailSource.includes("key={evidence.evidenceVersionRef}") &&
    detailSource.includes('disabled={preview.status === "loading"}') &&
    detailSource.includes('role="alert"') &&
    downloadSource.includes("openBrowserUrlInNewTab") &&
    detailClientSource.includes("normalizeSignedDownloadUrlForBrowser") &&
    !(detailSource + detailClientSource).includes("localStorage") &&
    !(detailSource + detailClientSource).includes("sessionStorage"),
  "Q16_per_card_preview_or_signed_url_lifetime_invalid",
);
assert(
  [detailClientSource, detailHookSource, detailSource, pageSource].every((
    value,
  ) =>
    !/(role\s*===|email\s*===|caseOwner|case_owner|workforceId|workforce_id|tenantId|tenant_id)/
      .test(value)
  ) &&
    detailEndpointSource.includes("app_evidence_review_case_detail_read_v1") &&
    previewEndpointSource.includes(
      "app_evidence_review_preview_source_read_v1",
    ) &&
    previewEndpointSource.includes("createSignedUrl"),
  "Q17_client_authority_or_backend_reuse_invalid",
);
assert(
  detailSource.includes("portal-content-stack") &&
    detailSource.includes("portal-card-compact") &&
    detailSource.includes("portal-row-list") &&
    detailSource.includes("fact-table--three-columns") &&
    detailSource.includes("status-pill") &&
    detailSource.includes("button button-secondary button-compact") &&
    layoutCss.includes("@media (max-width: 620px)") &&
    componentsCss.includes(".fact-table--three-columns") &&
    componentsCss.includes(".portal-card-compact") &&
    !detailSource.includes("style={{"),
  "Q18_shared_css_or_responsive_boundary_invalid",
);
assert(
  !detailSource.includes("evidence.review.decide") &&
    !detailSource.includes("CheckExecution") &&
    !detailSource.includes("parser") &&
    !detailClientSource.includes("storagePath") &&
    !detailClientSource.includes("storage_path") &&
    !detailClientSource.includes("bucket") &&
    detailSource.includes('href="/intern/dossiers"'),
  "Q19_scope_or_storage_privacy_invalid",
);

console.log("EVIDENCE_REVIEW_CASE_DETAIL_UI_Q01_Q19=PASS");
Deno.exit(0);
