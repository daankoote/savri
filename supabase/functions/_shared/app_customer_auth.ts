// supabase/functions/_shared/app_customer_auth.ts
//
// Canonical customer-auth boundary for new api-app-* customer endpoints.
// Supabase Auth validates the bearer JWT; app_* tables decide customer and
// dossier access. Do not reuse legacy dossier sessions here.

export type AppCustomerAuthErrorCode =
  | "missing_authorization"
  | "invalid_authorization"
  | "auth_email_missing"
  | "auth_email_not_verified"
  | "auth_user_not_found"
  | "app_identity_not_linked"
  | "app_identity_inactive"
  | "app_customer_inactive"
  | "dossier_not_found_or_forbidden";

export type AppVerifiedAuthUserContext = {
  authUserId: string;
  emailNormalized: string;
};

export type AppCustomerAuthContext = {
  authUserId: string;
  customerId: string;
  customerIds: string[];
  identityId: string;
  actorRef: string;
};

export type AppDossierAccessContext = {
  dossierId: string;
  customerId: string;
  status: string;
};

export type AppCaseAccessContext = {
  caseId: string;
  customerId: string;
  caseReference: string;
  sourceClass: string;
  sourceRef: string;
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

export type AppCaseAccessResult =
  | { ok: true; appCase: AppCaseAccessContext }
  | AppCustomerAuthFail;

type SupabaseLikeClient = {
  auth: {
    getUser: (token: string) => Promise<{
      data?: {
        user?: {
          id?: string;
          email?: string | null;
          email_confirmed_at?: string | null;
          confirmed_at?: string | null;
        } | null;
      } | null;
      error?: unknown;
    }>;
  };
  from: (table: string) => unknown;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authFail(
  status: number,
  code: AppCustomerAuthErrorCode,
  message = "Niet geautoriseerd.",
): AppCustomerAuthFail {
  return { ok: false, status, code, message };
}

function bearerFromRequest(req: Request): string | null | "malformed" {
  const header = req.headers.get("authorization") ||
    req.headers.get("Authorization") || "";
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

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function appAuthErrorResponseBody(error: AppCustomerAuthFail) {
  return {
    ok: false,
    error: error.message,
    code: error.code,
  };
}

export async function requireVerifiedSupabaseAuthUser(
  req: Request,
  serviceClient: SupabaseLikeClient,
): Promise<
  | { ok: true; context: AppVerifiedAuthUserContext }
  | AppCustomerAuthFail
> {
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

  const emailNormalized = normalizeEmail(authResult.data?.user?.email);
  if (!emailNormalized) {
    return authFail(401, "auth_email_missing");
  }

  const emailVerifiedAt = String(
    authResult.data?.user?.email_confirmed_at ||
      authResult.data?.user?.confirmed_at ||
      "",
  ).trim();
  if (!emailVerifiedAt) {
    return authFail(
      403,
      "auth_email_not_verified",
      "E-mailadres is nog niet bevestigd.",
    );
  }

  return {
    ok: true,
    context: {
      authUserId,
      emailNormalized,
    },
  };
}

export async function requireAppCustomer(
  req: Request,
  serviceClient: SupabaseLikeClient,
): Promise<AppCustomerAuthResult> {
  const verifiedAuth = await requireVerifiedSupabaseAuthUser(
    req,
    serviceClient,
  );
  if (!verifiedAuth.ok) return verifiedAuth;

  const authUserId = verifiedAuth.context.authUserId;

  const identityQuery = serviceClient
    .from("app_customer_identities") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => Promise<{
            data?:
              | Array<{
                id?: string;
                customer_id?: string;
                status?: string;
              }>
              | null;
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
    return authFail(
      500,
      "app_identity_not_linked",
      "Autorisatie tijdelijk niet beschikbaar.",
    );
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

  const accessQuery = serviceClient
    .from("app_customer_access_grants") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => Promise<{
            data?: Array<{ customer_id?: string }> | null;
            error?: unknown;
          }>;
        };
      };
    };
  const { data: accessRows, error: accessError } = await accessQuery
    .select("customer_id")
    .eq("auth_user_id", authUserId)
    .order("created_at", { ascending: true });
  if (accessError) {
    return authFail(
      500,
      "app_identity_not_linked",
      "Autorisatie tijdelijk niet beschikbaar.",
    );
  }
  const customerIds = [
    ...new Set(
      (Array.isArray(accessRows) ? accessRows : [])
        .map((row) => String(row.customer_id || "").trim())
        .filter(isUuid),
    ),
  ];
  if (!customerIds.length || !customerIds.includes(customerId)) {
    return authFail(403, "app_identity_not_linked");
  }

  const customerQuery = serviceClient
    .from("app_customers") as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => Promise<{
          data?: Array<{ id?: string; status?: string }> | null;
          error?: unknown;
        }>;
      };
    };

  const { data: customers, error: customerError } = await customerQuery
    .select("id,status")
    .in("id", customerIds);

  const activeCustomers = Array.isArray(customers)
    ? customers.filter((customer) =>
      isUuid(String(customer.id || "")) && customer.status === "active"
    )
    : [];
  if (
    customerError || activeCustomers.length !== customerIds.length ||
    !activeCustomers.some((customer) => customer.id === customerId)
  ) {
    return authFail(403, "app_customer_inactive");
  }

  return {
    ok: true,
    context: {
      authUserId,
      customerId,
      customerIds,
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
    return authFail(
      404,
      "dossier_not_found_or_forbidden",
      "Dossier niet gevonden.",
    );
  }

  const dossierQuery = serviceClient
    .from("app_customer_dossiers") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data?:
              | { id?: string; customer_id?: string; status?: string }
              | null;
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
    return authFail(
      404,
      "dossier_not_found_or_forbidden",
      "Dossier niet gevonden.",
    );
  }

  if (!authContext.customerIds.includes(String(dossier.customer_id || ""))) {
    return authFail(
      404,
      "dossier_not_found_or_forbidden",
      "Dossier niet gevonden.",
    );
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

export async function requireAppCaseAccess(
  serviceClient: SupabaseLikeClient,
  authContext: AppCustomerAuthContext,
  caseId: string,
): Promise<AppCaseAccessResult> {
  const normalizedCaseId = String(caseId || "").trim().toLowerCase();
  if (!isUuid(normalizedCaseId)) {
    return authFail(
      404,
      "dossier_not_found_or_forbidden",
      "Dossier niet gevonden.",
    );
  }

  const caseQuery = serviceClient.from("app_cases") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data?: {
            id?: string;
            customer_id?: string;
            case_reference?: string;
            source_class?: string;
            source_ref?: string;
          } | null;
          error?: unknown;
        }>;
      };
    };
  };
  const { data: appCase, error } = await caseQuery
    .select("id,customer_id,case_reference,source_class,source_ref")
    .eq("id", normalizedCaseId)
    .maybeSingle();

  if (
    error || !appCase?.id ||
    !authContext.customerIds.includes(String(appCase.customer_id || ""))
  ) {
    return authFail(
      404,
      "dossier_not_found_or_forbidden",
      "Dossier niet gevonden.",
    );
  }

  return {
    ok: true,
    appCase: {
      caseId: String(appCase.id),
      customerId: String(appCase.customer_id),
      caseReference: String(appCase.case_reference || ""),
      sourceClass: String(appCase.source_class || ""),
      sourceRef: String(appCase.source_ref || ""),
    },
  };
}
