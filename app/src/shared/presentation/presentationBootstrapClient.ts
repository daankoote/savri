import { resolvePublicApiRuntimeConfig } from "../../features/auth/authRuntimeConfig";
import {
  projectPresentationBrand,
  type PublicPresentationBrandV1,
  validatePresentationBrandConfigV1,
} from "../../../../platform/runtime/presentation/presentation_brand_config.ts";

export type PresentationBootstrapResult =
  | Readonly<{ ok: true; presentation: PublicPresentationBrandV1 }>
  | Readonly<{
    ok: false;
    code: "not_configured" | "service_unavailable" | "invalid_response";
  }>;

type JsonRecord = Record<string, unknown>;

const MODE = "presentation_bootstrap_browser";
const SCHEMA_VERSION = "presentation_bootstrap_browser_v1";
const RESPONSE_FIELDS = ["mode", "ok", "presentation", "schema_version"];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value: JsonRecord, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === fields.length &&
    actual.every((field, index) => field === fields[index]);
}

export function decodePresentationBootstrapResponse(
  body: unknown,
): PresentationBootstrapResult {
  if (
    !isRecord(body) || !hasExactFields(body, RESPONSE_FIELDS) ||
    body.ok !== true || body.mode !== MODE ||
    body.schema_version !== SCHEMA_VERSION
  ) return { ok: false, code: "invalid_response" };
  const validated = validatePresentationBrandConfigV1(body.presentation);
  if (!validated.ok) return { ok: false, code: "invalid_response" };
  return {
    ok: true,
    presentation: projectPresentationBrand(validated.value),
  };
}

export async function loadPresentationBootstrap(
  fetchImpl: typeof fetch = fetch,
): Promise<PresentationBootstrapResult> {
  const runtime = resolvePublicApiRuntimeConfig();
  if (!runtime.ok) return { ok: false, code: "not_configured" };

  let response: Response;
  try {
    response = await fetchImpl(
      `${runtime.apiBaseUrl}/api-app-presentation-bootstrap`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${runtime.anonKey}`,
          apikey: runtime.anonKey,
        },
      },
    );
  } catch {
    return { ok: false, code: "service_unavailable" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: "invalid_response" };
  }
  if (!response.ok) return { ok: false, code: "service_unavailable" };
  return decodePresentationBootstrapResponse(body);
}
