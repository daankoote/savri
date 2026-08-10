export const SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION =
  "signup-submission-receipt-v1" as const;

export type SignupSubmissionReceipt = {
  schemaVersion: typeof SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION;
  safeReference: string;
  status: "pending_verification";
};

const STORAGE_KEY = "enval.signup.submission-receipt.v1";
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
      "safeReference|schemaVersion|status" ||
    candidate.schemaVersion !== SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION ||
    candidate.status !== "pending_verification" ||
    typeof candidate.safeReference !== "string" ||
    !SAFE_REFERENCE.test(candidate.safeReference)
  ) return null;
  return candidate as SignupSubmissionReceipt;
}

export function readSignupSubmissionReceipt(): SignupSubmissionReceipt | null {
  const storage = sessionStorageOrNull();
  if (!storage) return null;
  try {
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
  sessionStorageOrNull()?.removeItem(STORAGE_KEY);
}

export function writeSignupSubmissionReceipt(input: {
  safeReference: string;
  status: "pending_verification";
}): SignupSubmissionReceipt | null {
  const receipt = parseReceipt({
    schemaVersion: SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION,
    safeReference: input.safeReference,
    status: input.status,
  });
  if (!receipt) return null;
  try {
    sessionStorageOrNull()?.setItem(STORAGE_KEY, JSON.stringify(receipt));
  } catch (_error) {
    // The server result remains authoritative when presentation caching fails.
  }
  return receipt;
}
