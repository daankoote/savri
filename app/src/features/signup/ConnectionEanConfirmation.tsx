import { getConfirmableEnergyEanCandidates } from "../invoice-analysis/energyEanCandidateExtractor";
import type {
  ConnectionDeclarationDraft,
  ValidationIssue,
} from "./signupTypes";
import { signupFieldErrorId } from "./signupValidation";

type ConnectionEanConfirmationProps = {
  value: ConnectionDeclarationDraft;
  error: ValidationIssue | null;
  onChange: (value: ConnectionDeclarationDraft) => void;
  onRequireManualEntry: () => void;
};

function cleanEanInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 18);
}

export function ConnectionEanConfirmation({
  error,
  onChange,
  onRequireManualEntry,
  value,
}: ConnectionEanConfirmationProps) {
  const confirmableCandidates = getConfirmableEnergyEanCandidates(
    value.candidates,
  );
  const errorId = error ? signupFieldErrorId(error.fieldPath) : undefined;
  const isManual = value.sourceMode === "manual";
  const hasCandidate = [
    "electricity_candidate_found",
    "unclassified_candidate_found",
    "multiple_candidates",
    "customer_confirmed",
  ].includes(value.preflightStatus);
  const showExtractionFallback = value.preflightStatus === "no_candidate" ||
    value.preflightStatus === "parser_error" ||
    (value.preflightStatus === "manual_entry_required" &&
      value.candidates.length > 0 &&
      value.candidates.every((candidate) =>
        candidate.classification === "gas"
      ));

  const selectCandidate = (normalizedEan: string) => {
    onChange({
      ...value,
      sourceMode: "document",
      selectedCandidateEan: normalizedEan,
      confirmedEan: "",
      manualEan: "",
      customerConfirmed: false,
      preflightStatus: confirmableCandidates.length > 1
        ? "multiple_candidates"
        : value.preflightStatus,
    });
  };

  const confirmCandidate = (customerConfirmed: boolean) => {
    onChange({
      ...value,
      sourceMode: "document",
      confirmedEan: customerConfirmed ? value.selectedCandidateEan : "",
      customerConfirmed,
      preflightStatus: customerConfirmed
        ? "customer_confirmed"
        : confirmableCandidates.length > 1
        ? "multiple_candidates"
        : confirmableCandidates.find((candidate) =>
            candidate.normalizedEan === value.selectedCandidateEan
          )?.classification === "electricity"
        ? "electricity_candidate_found"
        : "unclassified_candidate_found",
    });
  };

  const updateManualEan = (manualEan: string) => {
    onChange({
      ...value,
      sourceMode: "manual",
      preflightStatus: "manual_entry_required",
      candidates: [],
      selectedCandidateEan: "",
      confirmedEan: "",
      manualEan: cleanEanInput(manualEan),
      customerConfirmed: false,
    });
  };

  const confirmManualEan = (customerConfirmed: boolean) => {
    const valid = /^\d{18}$/.test(value.manualEan);
    onChange({
      ...value,
      sourceMode: "manual",
      candidates: [],
      selectedCandidateEan: "",
      confirmedEan: customerConfirmed && valid ? value.manualEan : "",
      customerConfirmed: customerConfirmed && valid,
      preflightStatus: customerConfirmed && valid
        ? "manual_customer_confirmed"
        : "manual_entry_required",
    });
  };

  if (value.preflightStatus === "idle") return null;

  if (value.preflightStatus === "parsing") {
    return (
      <p className="fine-print" aria-live="polite">
        Aansluitgegevens worden uit het document gehaald…
      </p>
    );
  }

  return (
    <div className="consent-checklist" aria-live="polite">
      {showExtractionFallback && !isManual
        ? (
          <>
            <p className="field-message">
              We konden de EAN van je elektriciteitsaansluiting niet uit het
              document halen.
            </p>
            <button
              className="button-link"
              onClick={onRequireManualEntry}
              type="button"
            >
              EAN handmatig invoeren
            </button>
          </>
        )
        : null}
      {hasCandidate
        ? (
          <>
            {confirmableCandidates.length > 1
              ? (
                <div className="consent-checklist">
                  {confirmableCandidates.map((candidate) => (
                    <label
                      className="consent-check-item"
                      key={candidate.normalizedEan}
                    >
                      <input
                        checked={value.selectedCandidateEan ===
                          candidate.normalizedEan}
                        name="ean-candidate"
                        onChange={() =>
                          selectCandidate(candidate.normalizedEan)}
                        type="radio"
                      />
                      <span>
                        <strong>{candidate.normalizedEan}</strong>
                      </span>
                    </label>
                  ))}
                </div>
              )
              : null}

            {value.selectedCandidateEan
              ? (
                <label className="consent-check-item">
                  <input
                    aria-describedby={errorId}
                    aria-invalid={error ? true : undefined}
                    checked={value.customerConfirmed}
                    onChange={(event) =>
                      confirmCandidate(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span>
                    <strong>
                      Dit is de EAN van mijn elektriciteitsaansluiting.
                    </strong>
                  </span>
                </label>
              )
              : null}

            <button
              className="button-link"
              onClick={onRequireManualEntry}
              type="button"
            >
              EAN klopt niet
            </button>
          </>
        )
        : null}

      {isManual
        ? (
          <>
            {showExtractionFallback
              ? (
                <p className="field-message">
                  We konden de EAN van je elektriciteitsaansluiting niet uit het
                  document halen.
                </p>
              )
              : null}
            <label className="field">
              <span>EAN handmatig invoeren</span>
              <input
                aria-describedby={errorId}
                aria-invalid={error ? true : undefined}
                inputMode="numeric"
                onChange={(event) => updateManualEan(event.target.value)}
                type="text"
                value={value.manualEan}
              />
              {error
                ? (
                  <small className="field-message" id={errorId} role="alert">
                    {error.message}
                  </small>
                )
                : null}
            </label>
            <p className="fine-print">
              Deze bevestigde EAN wordt voor deze aansluiting gebruikt.
            </p>
            <label className="consent-check-item">
              <input
                aria-describedby={errorId}
                aria-invalid={error ? true : undefined}
                checked={value.customerConfirmed}
                disabled={!/^\d{18}$/.test(value.manualEan)}
                onChange={(event) =>
                  confirmManualEan(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>
                <strong>
                  Dit is de EAN van mijn elektriciteitsaansluiting.
                </strong>
              </span>
            </label>
          </>
        )
        : null}

      {error && !isManual
        ? (
          <small className="field-message" id={errorId} role="alert">
            {error.message}
          </small>
        )
        : null}
    </div>
  );
}
