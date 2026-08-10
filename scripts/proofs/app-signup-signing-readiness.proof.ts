import {
  createFreshDocumentFirstSignupDraft,
  documentFirstSignupReducer,
} from "../../app/src/features/signup/documentFirstSignupModel.ts";
import { selectSigningFileReadiness } from "../../app/src/features/signup/documentFirstSignupSelectors.ts";
import {
  selectSigningStartReadiness,
  type SigningReadinessReason,
  signingStartReadinessMessage,
} from "../../app/src/features/signup/signing/signingIntent.ts";

const ROOT = new URL("../../", import.meta.url);

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, ROOT));
}

function readiness(
  reasons: SigningReadinessReason[],
  requiredUploadsConfirmed = true,
  intakeSessionAvailable = true,
) {
  return selectSigningStartReadiness({
    intentReadiness: { ready: reasons.length === 0, reasons },
    requiredUploadsConfirmed,
    intakeSessionAvailable,
  });
}

const results: Array<{ id: string; ok: boolean }> = [];
async function run(id: string, proof: () => void | Promise<void>) {
  try {
    await proof();
    results.push({ id, ok: true });
  } catch (_error) {
    results.push({ id, ok: false });
  }
}

await run("Q01_incomplete_acceptance_disabled_with_reason", () => {
  const result = readiness([
    "legal_action_missing",
    "legal_version_not_current",
    "signature_challenge_missing",
  ]);
  assert(
    !result.ready && result.reasons[0] === "legal_action_missing" &&
      signingStartReadinessMessage(result.reasons[0]) ===
        "Lees en bevestig de voorwaarden en privacyverklaring.",
    "missing_acceptance_not_explained",
  );
});

await run("Q02_missing_typed_name_disabled_with_reason", () => {
  const result = readiness([
    "signer_full_name_missing",
    "legal_version_not_current",
    "signature_challenge_missing",
  ]);
  assert(
    !result.ready && result.reasons[0] === "signer_full_name_missing" &&
      signingStartReadinessMessage(result.reasons[0]) ===
        "Vul je volledige naam in.",
    "missing_name_not_explained",
  );
});

await run("Q03_unconfirmed_required_upload_disabled_with_reason", () => {
  let draft = createFreshDocumentFirstSignupDraft("particulier");
  const missing = selectSigningFileReadiness(draft);
  assert(!missing.ready, "fresh_upload_state_allowed");

  const locationId = draft.locationOrder[0];
  const energy = draft.energyDocumentsByLocationId[locationId];
  const chargerId = draft.chargerOrderByLocationId[locationId]?.[0];
  const chargerDocument = chargerId
    ? draft.chargerDocumentsByChargerId[chargerId]?.find((document) =>
      document.documentType === "installation_invoice"
    )
    : null;
  assert(energy && chargerDocument, "required_document_fixture_missing");
  draft = documentFirstSignupReducer(draft, {
    type: "update_energy_document",
    document: {
      ...energy,
      file: new File(["%PDF proof"], "energy.pdf", {
        type: "application/pdf",
      }),
      quarantineStatus: "confirmed_quarantine",
      quarantineFileReference: "11111111-1111-4111-8111-111111111111",
    },
  });
  draft = documentFirstSignupReducer(draft, {
    type: "update_charger_document",
    document: {
      ...chargerDocument,
      file: new File(["%PDF proof"], "charger.pdf", {
        type: "application/pdf",
      }),
      quarantineStatus: "confirmed_quarantine",
      quarantineFileReference: "22222222-2222-4222-8222-222222222222",
    },
  });
  const confirmed = selectSigningFileReadiness(draft);
  const blocked = readiness(
    ["legal_version_not_current", "signature_challenge_missing"],
    false,
  );
  assert(
    confirmed.ready && confirmed.fileReferences.length === 2 &&
      !blocked.ready && blocked.reasons[0] === "required_upload_missing" &&
      signingStartReadinessMessage(blocked.reasons[0]) ===
        "Wacht tot alle vereiste documenten veilig zijn ontvangen.",
    "confirmed_upload_readiness_invalid",
  );
});

await run("Q04_completed_customer_prerequisites_enable_cta", () => {
  const result = readiness([
    "legal_version_not_current",
    "signature_challenge_missing",
  ]);
  assert(
    result.ready && result.reasons.length === 0,
    "server_owned_candidate_gate_still_disables_cta",
  );
});

const summary = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
);
const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const client = await source(
  "app/src/features/signup/signupSigningClient.ts",
);
const receipt = await source(
  "app/src/features/signup/signupSubmissionReceiptStore.ts",
);
const challengeHandler = summary.slice(
  summary.indexOf("const requestChallenge = async () =>"),
  summary.indexOf("const finalizeSigning = async () =>"),
);

await run("Q05_enabled_click_issues_one_challenge", () => {
  assert(
    summary.includes("onClick={() => void requestChallenge()}") &&
      challengeHandler.includes("challengeRequestInFlightRef.current") &&
      (challengeHandler.match(/requestSignupSigningChallenge\(\)/g) || [])
          .length === 1,
    "challenge_click_not_single_flight",
  );
});

await run("Q06_challenge_click_does_not_finalize", () => {
  assert(
    !challengeHandler.includes("finalizeSignupSigning") &&
      summary.indexOf("const finalizeSigning = async () =>") >
        summary.indexOf("const requestChallenge = async () =>"),
    "challenge_click_finalized",
  );
});

await run("Q07_challenge_success_enters_otp_state", () => {
  assert(
    challengeHandler.includes("setChallenge(result.value)") &&
      challengeHandler.includes('setRuntimeStatus("awaiting_otp")') &&
      summary.includes("Eenmalige code") &&
      summary.includes("Ondertekening bevestigen"),
    "challenge_success_did_not_open_otp_state",
  );
});

await run("Q08_challenge_error_is_retryable", () => {
  assert(
    challengeHandler.includes('setRuntimeStatus("error")') &&
      challengeHandler.includes("setRuntimeMessage(result.message)") &&
      summary.includes('runtimeStatus === "requesting"') &&
      !summary.includes('runtimeStatus === "error"}'),
    "challenge_error_not_retryable",
  );
});

await run("Q09_step_navigation_preserves_valid_customer_state", () => {
  const draftEffect = shell.slice(
    shell.indexOf("if (signingCustomerDraftRef.current === draft)"),
    shell.indexOf("}, [draft]);"),
  );
  assert(
    shell.includes("const [signingCustomerState, setSigningCustomerState]") &&
      shell.includes("customerState={signingCustomerState}") &&
      shell.includes("onCustomerStateChange={setSigningCustomerState}") &&
      draftEffect.includes("createSigningCustomerState") &&
      !draftEffect.includes("activeStep") &&
      !summary.includes("const [summaryConfirmed") &&
      !summary.includes("const [mandateYear") &&
      !summary.includes("const [legalActions") &&
      !summary.includes("const [signerInput"),
    "step_navigation_resets_signing_customer_state",
  );
});

await run("Q10_refresh_hydration_remains_server_authoritative", () => {
  assert(
    shell.includes("readSignupSigningStatus()") &&
      shell.includes('result.value.signingState === "collecting"') &&
      shell.includes('recoveryStatus === "loading"') &&
      shell.includes('recoveryStatus === "error"') &&
      receipt.includes("window.sessionStorage") &&
      !receipt.includes("fetch(") &&
      !receipt.includes("managementCapability"),
    "refresh_hydration_became_client_authoritative",
  );
});

await run("Q11_finalized_intake_cannot_challenge_again", () => {
  assert(
    shell.indexOf("if (submissionReceipt)") <
        shell.lastIndexOf('<fieldset className="signup-lock-boundary"') &&
      shell.includes("setSignupLocked(true)") &&
      shell.includes('signingState === "finalized"') === false &&
      client.includes('signingState: "finalized"') &&
      client.includes("locked: true"),
    "finalized_surface_is_editable",
  );
});

await run("Q12_no_secret_or_otp_url_projection", () => {
  assert(
    !summary.includes("managementCapability") &&
      !summary.includes("intakeReference") &&
      !summary.includes("window.location") &&
      !client.includes("URLSearchParams") &&
      !client.includes("window.location") &&
      client.includes("body: JSON.stringify(body)") &&
      challengeHandler.includes("deliveryTargetMasked") &&
      !challengeHandler.includes("otpCode") &&
      !challengeHandler.includes("challengeReference"),
    "secret_or_otp_url_projection_detected",
  );
});

for (const result of results) {
  console.log(`${result.id}=${result.ok ? "PASS" : "FAIL"}`);
}
assert(results.every((result) => result.ok), "signing_readiness_proof_failed");
console.log("signup-signing-readiness-09b2c-r3-proof-ok");
