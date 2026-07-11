// supabase/functions/_shared/app_customer_auth.ts
//
// Canonical customer-auth boundary for new api-app-* customer endpoints.
// Supabase Auth validates the bearer JWT; app_* tables decide customer and
// dossier access. Do not reuse legacy dossier sessions here.

export type AppCustomerAuthErrorCode =
  | "missing_authorization"
  | "invalid_authorization"
  | "auth_user_not_found"
  | "app_identity_not_linked"
  | "app_identity_inactive"
  | "app_customer_inactive"
  | "dossier_not_found_or_forbidden";

export type AppCustomerAuthContext = {
  authUserId: string;
  customerId: string;
  identityId: string;
  actorRef: string;
};

export type AppDossierAccessContext = {
  dossierId: string;
  customerId: string;
  status: string;
};

export type AppCustomerAuthFail = {
  ok: false;
  status: number;
  code: AppCustomerAuthErrorCode;
  message: string;
};

export type AppCustomerAuthResult =
  | { ok: true; context: AppCustomerAuthContext }
  | AppCustomerAuthFail;

export type AppDossierAccessResult =
  | { ok: true; dossier: AppDossierAccessContext }
  | AppCustomerAuthFail;

type SupabaseLikeClient = {
  auth: {
    getUser: (token: string) => Promise<{
      data?: { user?: { id?: string } | null } | null;
      error?: unknown;
    }>;
  };
  from: (table: string) => unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authFail(
  status: number,
  code: AppCustomerAuthErrorCode,
  message = "Niet geautoriseerd.",
): AppCustomerAuthFail {
  return { ok: false, status, code, message };
}

function bearerFromRequest(req: Request): string | null | "malformed" {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const trimmed = header.trim();
  if (!trimmed) return null;

  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!match?.[1]?.trim()) return "malformed";

  const token = match[1].trim();
  if (/\s/.test(token)) return "malformed";
  return token;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function actorRefForIdentity(identityId: string): string {
  return `app_customer_identity:${identityId}`;
}

export function appAuthErrorResponseBody(error: AppCustomerAuthFail) {
  return {
    ok: false,
    error: error.message,
    code: error.code,
  };
}

export async function requireAppCustomer(
  req: Request,
  serviceClient: SupabaseLikeClient,
): Promise<AppCustomerAuthResult> {
  const bearer = bearerFromRequest(req);
  if (!bearer) {
    return authFail(401, "missing_authorization");
  }
  if (bearer === "malformed") {
    return authFail(401, "invalid_authorization");
  }

  const authResult = await serviceClient.auth.getUser(bearer);
  if (authResult.error) {
    return authFail(401, "invalid_authorization");
  }

  const authUserId = String(authResult.data?.user?.id || "").trim();
  if (!authUserId || !isUuid(authUserId)) {
    return authFail(401, "auth_user_not_found");
  }

  const identityQuery = serviceClient
    .from("app_customer_identities") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => Promise<{
            data?: Array<{
              id?: string;
              customer_id?: string;
              status?: string;
            }> | null;
            error?: unknown;
          }>;
        };
      };
    };

  const { data: identities, error: identityError } = await identityQuery
    .select("id,customer_id,status")
    .eq("auth_user_id", authUserId)
    .order("created_at", { ascending: true });

  if (identityError) {
    return authFail(500, "app_identity_not_linked", "Autorisatie tijdelijk niet beschikbaar.");
  }

  const rows = Array.isArray(identities) ? identities : [];
  if (!rows.length) {
    return authFail(403, "app_identity_not_linked");
  }

  const activeRows = rows.filter((row) => row.status === "active");
  if (!activeRows.length) {
    return authFail(403, "app_identity_inactive");
  }

  if (activeRows.length !== 1) {
    return authFail(403, "app_identity_not_linked");
  }

  const identity = activeRows[0];
  const identityId = String(identity.id || "").trim();
  const customerId = String(identity.customer_id || "").trim();
  if (!isUuid(identityId) || !isUuid(customerId)) {
    return authFail(403, "app_identity_not_linked");
  }

  const customerQuery = serviceClient
    .from("app_customers") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data?: { id?: string; status?: string } | null;
            error?: unknown;
          }>;
        };
      };
    };

  const { data: customer, error: customerError } = await customerQuery
    .select("id,status")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError || !customer?.id) {
    return authFail(403, "app_customer_inactive");
  }

  if (customer.status !== "active") {
    return authFail(403, "app_customer_inactive");
  }

  return {
    ok: true,
    context: {
      authUserId,
      customerId,
      identityId,
      actorRef: actorRefForIdentity(identityId),
    },
  };
}

export async function requireAppDossierAccess(
  serviceClient: SupabaseLikeClient,
  authContext: AppCustomerAuthContext,
  dossierId: string,
): Promise<AppDossierAccessResult> {
  const normalizedDossierId = String(dossierId || "").trim().toLowerCase();
  if (!isUuid(normalizedDossierId)) {
    return authFail(404, "dossier_not_found_or_forbidden", "Dossier niet gevonden.");
  }

  const dossierQuery = serviceClient
    .from("app_customer_dossiers") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data?: { id?: string; customer_id?: string; status?: string } | null;
            error?: unknown;
          }>;
        };
      };
    };

  const { data: dossier, error: dossierError } = await dossierQuery
    .select("id,customer_id,status")
    .eq("id", normalizedDossierId)
    .maybeSingle();

  if (dossierError || !dossier?.id) {
    return authFail(404, "dossier_not_found_or_forbidden", "Dossier niet gevonden.");
  }

  if (dossier.customer_id !== authContext.customerId) {
    return authFail(404, "dossier_not_found_or_forbidden", "Dossier niet gevonden.");
  }

  return {
    ok: true,
    dossier: {
      dossierId: String(dossier.id),
      customerId: String(dossier.customer_id),
      status: String(dossier.status || ""),
    },
  };
}
