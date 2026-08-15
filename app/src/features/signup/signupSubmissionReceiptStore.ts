export const SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION =
  "signup-submission-receipt-v3" as const;

export type SignupSubmissionReceipt = {
  schemaVersion: typeof SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION;
  safeReference: string;
  status: "submitted_for_review";
  promotionState: "pending" | "promoted" | "blocked";
  accountHandoff:
    | "existing_account_login_required"
    | "account_activation_available"
    | "already_authenticated"
    | "blocked";
};

const STORAGE_KEY = "enval.signup.submission-receipt.v3";
const LEGACY_V2_STORAGE_KEY = "enval.signup.submission-receipt.v2";
const LEGACY_STORAGE_KEY = "enval.signup.submission-receipt.v1";
const SAFE_REFERENCE = /^SIG-[A-F0-9]{12}$/;

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch (_error) {
    return null;
  }
}

function parseReceipt(value: unknown): SignupSubmissionReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).sort().join("|") !==
      "accountHandoff|promotionState|safeReference|schemaVersion|status" ||
    candidate.schemaVersion !== SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION ||
    candidate.status !== "submitted_for_review" ||
    !["pending", "promoted", "blocked"].includes(
      String(candidate.promotionState || ""),
    ) ||
    ![
      "existing_account_login_required",
      "account_activation_available",
      "already_authenticated",
      "blocked",
    ].includes(String(candidate.accountHandoff || "")) ||
    typeof candidate.safeReference !== "string" ||
    !SAFE_REFERENCE.test(candidate.safeReference)
  ) return null;
  return candidate as SignupSubmissionReceipt;
}

export function readSignupSubmissionReceipt(): SignupSubmissionReceipt | null {
  const storage = sessionStorageOrNull();
  if (!storage) return null;
  try {
    storage.removeItem(LEGACY_STORAGE_KEY);
    storage.removeItem(LEGACY_V2_STORAGE_KEY);
    const receipt = parseReceipt(
      JSON.parse(storage.getItem(STORAGE_KEY) || "null"),
    );
    if (!receipt) storage.removeItem(STORAGE_KEY);
    return receipt;
  } catch (_error) {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearSignupSubmissionReceipt(): void {
  const storage = sessionStorageOrNull();
  storage?.removeItem(STORAGE_KEY);
  storage?.removeItem(LEGACY_V2_STORAGE_KEY);
  storage?.removeItem(LEGACY_STORAGE_KEY);
}

export function writeSignupSubmissionReceipt(input: {
  safeReference: string;
  status: "submitted_for_review";
  promotionState: "pending" | "promoted" | "blocked";
  accountHandoff: SignupSubmissionReceipt["accountHandoff"];
}): SignupSubmissionReceipt | null {
  const receipt = parseReceipt({
    schemaVersion: SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION,
    safeReference: input.safeReference,
    status: input.status,
    promotionState: input.promotionState,
    accountHandoff: input.accountHandoff,
  });
  if (!receipt) return null;
  try {
    sessionStorageOrNull()?.setItem(STORAGE_KEY, JSON.stringify(receipt));
  } catch (_error) {
    // The server result remains authoritative when presentation caching fails.
  }
  return receipt;
}
