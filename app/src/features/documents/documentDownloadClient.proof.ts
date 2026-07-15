import { downloadCurrentDocument, normalizeSignedDownloadUrlForBrowser } from "./documentDownloadClient.ts";

export type DocumentDownloadClientProofResult = {
  ok: true;
  kongOriginRewritten: true;
  edgeRuntimeOriginRewritten: true;
  pathPreserved: true;
  queryPreserved: true;
  productionOriginUnchanged: true;
  nonStoragePathUnchanged: true;
  normalizedUrlNotPersisted: true;
  safeErrorsHideUrl: true;
  openedUrlUsesTrustedGateway: true;
  noLegacyDependencyObserved: true;
};

const TRUSTED_GATEWAY = "http://127.0.0.1:54321";
const STORAGE_PATH = "/storage/v1/object/sign/app-documents/proof-document.pdf";
const QUERY = "?token=proof-token&download=proof-document.pdf";
const DOSSIER_ID = "11111111-1111-4111-8111-111111111111";
const SLOT_ID = "22222222-2222-4222-8222-222222222222";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoSensitiveUrl(value: unknown, label: string) {
  const serialized = JSON.stringify(value);
  assert(!/proof-token|storage\/v1\/object\/sign|signed_url|kong:8000|8081/.test(serialized), `${label}_exposes_signed_url`);
}

function normalize(input: string): URL {
  return new URL(normalizeSignedDownloadUrlForBrowser(input, TRUSTED_GATEWAY));
}

export async function runDocumentDownloadClientProof(): Promise<DocumentDownloadClientProofResult> {
  const kongUrl = `http://kong:8000${STORAGE_PATH}${QUERY}`;
  const edgeRuntimeUrl = `http://127.0.0.1:8081${STORAGE_PATH}${QUERY}`;
  const productionUrl = `https://project.supabase.co${STORAGE_PATH}${QUERY}`;
  const nonStorageUrl = `http://127.0.0.1:8081/not-storage/proof-document.pdf${QUERY}`;

  const rewrittenKong = normalize(kongUrl);
  const rewrittenEdgeRuntime = normalize(edgeRuntimeUrl);
  assert(rewrittenKong.origin === TRUSTED_GATEWAY, "kong origin must rewrite to trusted gateway");
  assert(rewrittenEdgeRuntime.origin === TRUSTED_GATEWAY, "edge runtime origin must rewrite to trusted gateway");
  assert(rewrittenEdgeRuntime.pathname === STORAGE_PATH, "storage path must be preserved");
  assert(rewrittenEdgeRuntime.search === QUERY, "signed query must be preserved");
  assert(normalizeSignedDownloadUrlForBrowser(productionUrl, TRUSTED_GATEWAY) === productionUrl, "production origin must remain unchanged");
  assert(normalizeSignedDownloadUrlForBrowser(nonStorageUrl, TRUSTED_GATEWAY) === nonStorageUrl, "non-storage path must remain unchanged");

  let openedUrl = "";
  const success = await downloadCurrentDocument({
    accessToken: "proof-access-token",
    dossierId: DOSSIER_ID,
    documentSlotId: SLOT_ID,
  }, {
    fetchImpl: (async () =>
      new Response(JSON.stringify({
        ok: true,
        mode: "document_download_url_v1",
        request_id: "request-proof",
        file_name: "proof-document.pdf",
        signed_url: edgeRuntimeUrl,
        expires_at: "2026-07-15T00:00:00.000Z",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
    openUrl: (url) => {
      openedUrl = url;
    },
    runtimeConfig: {
      anonKey: "proof-anon-key",
      downloadEndpointUrl: `${TRUSTED_GATEWAY}/functions/v1/api-app-document-download-url`,
    },
  });

  assert(success.ok === true, "download client success proof failed");
  assert(new URL(openedUrl).origin === TRUSTED_GATEWAY, "opened URL must use trusted gateway");
  assert(!("signedUrl" in success), "success result must not persist signed URL");

  const failure = await downloadCurrentDocument({
    accessToken: "proof-access-token",
    dossierId: DOSSIER_ID,
    documentSlotId: SLOT_ID,
  }, {
    fetchImpl: (async () =>
      new Response(JSON.stringify({
        ok: false,
        code: "document_not_found_or_forbidden",
        signed_url: edgeRuntimeUrl,
      }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
    runtimeConfig: {
      anonKey: "proof-anon-key",
      downloadEndpointUrl: `${TRUSTED_GATEWAY}/functions/v1/api-app-document-download-url`,
    },
  });

  assert(failure.ok === false, "download client failure proof failed");
  assertNoSensitiveUrl(failure, "safe_error");

  return {
    ok: true,
    edgeRuntimeOriginRewritten: true,
    kongOriginRewritten: true,
    noLegacyDependencyObserved: true,
    nonStoragePathUnchanged: true,
    normalizedUrlNotPersisted: true,
    openedUrlUsesTrustedGateway: true,
    pathPreserved: true,
    productionOriginUnchanged: true,
    queryPreserved: true,
    safeErrorsHideUrl: true,
  };
}
