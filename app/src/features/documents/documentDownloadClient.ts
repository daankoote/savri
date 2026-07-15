import { resolveAuthRuntimeConfig } from "../auth/authRuntimeConfig.ts";

type RuntimeConfig = {
  anonKey: string;
  downloadEndpointUrl: string;
};

type DownloadDocumentInput = {
  accessToken: string;
  dossierId: string;
  documentSlotId: string;
};

type UnknownRecord = Record<string, unknown>;

type AnchorLike = {
  download: string;
  href: string;
  rel: string;
  target: string;
  click: () => void;
  remove: () => void;
};

type BrowserDocumentLike = {
  body: {
    appendChild: (node: AnchorLike) => void;
  };
  createElement: (tagName: "a") => AnchorLike;
};

export type DownloadDocumentResult =
  | { ok: true; fileName: string; expiresAt: string; opened: true; requestId: string }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

export type DocumentDownloadDependencies = {
  fetchImpl?: typeof fetch;
  openUrl?: (url: string, fileName: string) => void;
  runtimeConfig?: RuntimeConfig;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_LOCAL_SIGNED_URL_HOSTS = new Set([
  "kong",
  "supabase_kong_enval",
  "supabase_storage_enval",
  "storage",
]);
const STORAGE_SIGNED_PATH_MARKER = "/storage/v1/object/sign/";

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: UnknownRecord, key: string): string {
  return typeof record[key] === "string" ? record[key].trim() : "";
}

function endpointFromApiBase(apiBaseUrl: string, endpoint: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/${endpoint}`;
}

function resolveDownloadRuntimeConfig(config?: RuntimeConfig): RuntimeConfig | null {
  if (config) return config;

  const authConfig = resolveAuthRuntimeConfig();
  if (!authConfig.ok) return null;

  const dashboardSuffix = "/api-app-dashboard-get";
  const dashboardUrl = authConfig.dashboardEndpointUrl;
  const apiBaseUrl = dashboardUrl.endsWith(dashboardSuffix)
    ? dashboardUrl.slice(0, -dashboardSuffix.length)
    : "";
  if (!apiBaseUrl) return null;

  return {
    anonKey: authConfig.anonKey,
    downloadEndpointUrl: endpointFromApiBase(apiBaseUrl, "api-app-document-download-url"),
  };
}

function safeError(code: string, message: string, retryable = true): DownloadDocumentResult {
  return { ok: false, error: { code, message, retryable } };
}

function browserDocument(): BrowserDocumentLike | null {
  const candidate = (globalThis as typeof globalThis & { document?: BrowserDocumentLike }).document;
  return candidate?.body && typeof candidate.createElement === "function" ? candidate : null;
}

function openSignedUrl(url: string, fileName: string) {
  const documentRef = browserDocument();
  if (!documentRef) return;
  const link = documentRef.createElement("a");
  link.href = url;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  link.download = fileName;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
}

function isStorageSignedObjectPath(pathname: string): boolean {
  return pathname.includes(STORAGE_SIGNED_PATH_MARKER);
}

export function normalizeSignedDownloadUrlForBrowser(signedUrl: string, trustedGatewayOrigin: string): string {
  let parsedSignedUrl: URL;
  let trustedOrigin: URL;
  try {
    parsedSignedUrl = new URL(signedUrl);
    trustedOrigin = new URL(trustedGatewayOrigin);
  } catch (_error) {
    return signedUrl;
  }

  if (!isStorageSignedObjectPath(parsedSignedUrl.pathname)) return signedUrl;

  const signedHost = parsedSignedUrl.hostname.toLowerCase();
  const trustedHost = trustedOrigin.hostname.toLowerCase();
  const shouldRewrite =
    INTERNAL_LOCAL_SIGNED_URL_HOSTS.has(signedHost) ||
    ((signedHost === "localhost" || signedHost === "127.0.0.1") &&
      (trustedHost === "localhost" || trustedHost === "127.0.0.1") &&
      parsedSignedUrl.port !== trustedOrigin.port);

  if (!shouldRewrite) return signedUrl;

  parsedSignedUrl.protocol = trustedOrigin.protocol;
  parsedSignedUrl.hostname = trustedOrigin.hostname;
  parsedSignedUrl.port = trustedOrigin.port;
  return parsedSignedUrl.toString();
}

async function parseJsonResponse(response: Response): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await response.json() };
  } catch (_error) {
    return { ok: false };
  }
}

export async function downloadCurrentDocument(
  input: DownloadDocumentInput,
  dependencies: DocumentDownloadDependencies = {},
): Promise<DownloadDocumentResult> {
  const runtime = resolveDownloadRuntimeConfig(dependencies.runtimeConfig);
  if (!runtime) return safeError("not_configured", "Documentdownload is lokaal nog niet geconfigureerd.");

  const accessToken = input.accessToken.trim();
  const dossierId = input.dossierId.trim().toLowerCase();
  const documentSlotId = input.documentSlotId.trim().toLowerCase();
  if (!accessToken || !UUID_RE.test(dossierId) || !UUID_RE.test(documentSlotId)) {
    return safeError("invalid_input", "Controleer dossier en document.", false);
  }

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(runtime.downloadEndpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: runtime.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dossier_id: dossierId,
        document_slot_id: documentSlotId,
      }),
    });
  } catch (_error) {
    return safeError("service_unavailable", "Documentdownload is tijdelijk niet beschikbaar.");
  }

  const parsed = await parseJsonResponse(response);
  if (!parsed.ok) return safeError("invalid_response", "Documentdownload gaf een onverwacht antwoord.");

  if (!response.ok) {
    const code = isRecord(parsed.body) ? stringField(parsed.body, "code") || "download_failed" : "download_failed";
    return safeError(code, "Documentdownload is tijdelijk niet beschikbaar.", true);
  }

  if (!isRecord(parsed.body) || parsed.body.ok !== true || stringField(parsed.body, "mode") !== "document_download_url_v1") {
    return safeError("invalid_response", "Documentdownload gaf een onverwacht antwoord.");
  }

  const fileName = stringField(parsed.body, "file_name");
  const signedUrl = stringField(parsed.body, "signed_url");
  const expiresAt = stringField(parsed.body, "expires_at");
  const requestId = stringField(parsed.body, "request_id");
  if (!fileName || !signedUrl || !expiresAt || !requestId) {
    return safeError("invalid_response", "Documentdownload gaf een onverwacht antwoord.");
  }

  const browserUrl = normalizeSignedDownloadUrlForBrowser(signedUrl, new URL(runtime.downloadEndpointUrl).origin);
  (dependencies.openUrl ?? openSignedUrl)(browserUrl, fileName);

  return {
    ok: true,
    expiresAt,
    fileName,
    opened: true,
    requestId,
  };
}
