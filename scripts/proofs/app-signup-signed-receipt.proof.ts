import {
  clearSignupSubmissionReceipt,
  readSignupSubmissionReceipt,
  SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION,
  writeSignupSubmissionReceipt,
} from "../../app/src/features/signup/signupSubmissionReceiptStore.ts";

const ROOT = new URL("../../", import.meta.url);

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

function storageMock(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, ROOT));
}

const sessionStorage = storageMock();
const localStorage = storageMock();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { sessionStorage, localStorage },
});

const safeReference = "SIG-5B457BDED316";
const written = writeSignupSubmissionReceipt({
  safeReference,
  status: "submitted_for_review",
  promotionState: "pending",
  accountHandoff: "existing_account_login_required",
});
assert(written, "safe_receipt_not_written");
assert(sessionStorage.length === 1, "receipt_not_session_scoped");
assert(localStorage.length === 0, "receipt_written_to_local_storage");

const storageKey = sessionStorage.key(0);
assert(storageKey, "receipt_storage_key_missing");
const raw = sessionStorage.getItem(storageKey);
assert(raw, "receipt_storage_value_missing");
const parsed = JSON.parse(raw) as Record<string, unknown>;
assert(
  Object.keys(parsed).sort().join("|") ===
      "accountHandoff|promotionState|safeReference|schemaVersion|status" &&
    parsed.schemaVersion === SIGNUP_SUBMISSION_RECEIPT_SCHEMA_VERSION &&
    parsed.safeReference === safeReference &&
    parsed.status === "submitted_for_review" &&
    parsed.promotionState === "pending" &&
    parsed.accountHandoff === "existing_account_login_required",
  "receipt_shape_not_exact",
);

const forbiddenKeys = [
  "intake",
  "request",
  "capability",
  "idempotency",
  "email",
  "name",
  "address",
  "ean",
  "document",
  "legal",
  "snapshot",
  "otp",
  "challenge",
  "hash",
];
assert(
  forbiddenKeys.every((key) =>
    !Object.keys(parsed).some((candidate) =>
      candidate.toLowerCase().includes(key)
    )
  ),
  "receipt_contains_internal_or_personal_field",
);
assert(
  JSON.stringify(readSignupSubmissionReceipt()) === JSON.stringify(written),
  "presentation_receipt_not_restored",
);
clearSignupSubmissionReceipt();
assert(readSignupSubmissionReceipt() === null, "receipt_not_cleared");
writeSignupSubmissionReceipt({
  safeReference,
  status: "submitted_for_review",
  promotionState: "promoted",
  accountHandoff: "already_authenticated",
});

sessionStorage.setItem(
  storageKey,
  JSON.stringify({
    schemaVersion: "unknown-receipt-v9",
    safeReference,
    status: "submitted_for_review",
    promotionState: "pending",
  }),
);
assert(readSignupSubmissionReceipt() === null, "unknown_schema_not_ignored");
assert(
  sessionStorage.getItem(storageKey) === null,
  "corrupt_receipt_not_removed",
);

sessionStorage.setItem(storageKey, "{broken");
assert(readSignupSubmissionReceipt() === null, "corrupt_json_not_ignored");

const storeSource = await source(
  "app/src/features/signup/signupSubmissionReceiptStore.ts",
);
const shellSource = await source("app/src/features/signup/SignupPageShell.tsx");
const signingSource = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
);
const clientSource = await source(
  "app/src/features/signup/signupSigningClient.ts",
);
const endpointSource = await source(
  "supabase/functions/api-app-signup-signing-finalize/index.ts",
);
const hydrationStart = shellSource.indexOf("const hydrateSigningState");
const hydrationEnd = shellSource.indexOf(
  "\n  useEffect(() => {",
  hydrationStart,
);
const hydrationSource = shellSource.slice(hydrationStart, hydrationEnd);
const migrationSource = await source(
  "supabase/migrations/20260811100000_app_post_signing_customer_convergence.sql",
);

assert(
  signingSource.indexOf("writeSignupSubmissionReceipt(result.value)") >
      signingSource.indexOf("finalizeSignupSigning({") &&
    !signingSource.includes("clearSignupIntakeSession"),
  "successful_finalize_does_not_cache_receipt_safely",
);
assert(
  shellSource.includes("readSignupSigningStatus()") &&
    shellSource.indexOf("readSignupSigningStatus()") <
      shellSource.indexOf("writeSignupSubmissionReceipt({") &&
    shellSource.includes('result.value.signingState === "collecting"') &&
    shellSource.indexOf('recoveryStatus === "loading"') <
      shellSource.indexOf("if (submissionReceipt)") &&
    shellSource.indexOf('recoveryStatus === "error"') <
      shellSource.indexOf('<fieldset className="signup-lock-boundary"') &&
    shellSource.includes("Opnieuw proberen") &&
    shellSource.includes("recoveryBootstrapStartedRef.current") &&
    shellSource.includes("Je dossier is ondertekend en ingediend.") &&
    shellSource.includes("submissionReceipt.safeReference"),
  "server_authoritative_refresh_surface_not_fail_closed",
);
assert(
  shellSource.includes("const [submissionReceipt, setSubmissionReceipt]") &&
    shellSource.includes(">(null);") &&
    shellSource.includes("if (cachedReceipt)") &&
    shellSource.includes("setSubmissionReceipt(cachedReceipt)") &&
    !hydrationSource.includes("ensureIntake") &&
    !hydrationSource.includes("uploadSignupDocument") &&
    !hydrationSource.includes("requestSignupSigningChallenge") &&
    !hydrationSource.includes("finalizeSignupSigning"),
  "cached_receipt_became_core_truth_or_bootstrap_mutated",
);
assert(
  clientSource.includes('operation: "status"') &&
    clientSource.includes(
      "management_capability: session.managementCapability",
    ) &&
    endpointSource.includes('operation === "status"') &&
    endpointSource.includes('SB.rpc("app_signup_signing_status_v2"') &&
    endpointSource.indexOf('operation === "status"') <
      endpointSource.indexOf("signingLegalBundleAllowed(environment)"),
  "existing_owned_status_chain_missing",
);
assert(
  !storeSource.includes("fetch(") &&
    !storeSource.includes("localStorage") &&
    !storeSource.includes("managementCapability") &&
    !storeSource.includes("intakeReference") &&
    !storeSource.includes("accountType") &&
    !storeSource.includes("email") &&
    !storeSource.includes("canonical") &&
    !storeSource.includes("document"),
  "receipt_store_restores_draft_or_authorizes_api",
);
assert(
  migrationSource.includes("v_intake.status <> 'promoted'") &&
    migrationSource.includes("v_manage.consumed_at is null") &&
    migrationSource.includes("'intake_status', 'submitted_for_review'") &&
    migrationSource.includes("app_signup_signing_status_v2") &&
    migrationSource.includes("p_manage_token_sha256") &&
    migrationSource.includes("v_snapshot_count <> 1") &&
    migrationSource.includes("v_acceptance_count <> 3") &&
    migrationSource.includes("v_mandate_count <> 1") &&
    migrationSource.includes("v_evidence_count <> 1") &&
    migrationSource.includes("'signing_state', 'finalized'") &&
    migrationSource.includes("'locked', true") &&
    migrationSource.includes(
      "revoke all on function public.app_signup_signing_status_v2(uuid, text)",
    ),
  "server_mutation_lock_not_leading",
);

for (const sourceText of [storeSource, shellSource, clientSource]) {
  assert(
    !sourceText.includes("window.location") &&
      !sourceText.includes("localStorage"),
    "recovery_secret_or_reference_url_storage_risk",
  );
}

console.log("signup-signed-receipt-09b2c-proof-ok");
