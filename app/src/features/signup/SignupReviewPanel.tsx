import type { SignupValidationResult } from "./signupTypes";

type SignupReviewPanelProps = {
  result: SignupValidationResult | null;
};

export function SignupReviewPanel({ result }: SignupReviewPanelProps) {
  if (!result) {
    return null;
  }

  return (
    <div className={result.canStartDossier ? "review-panel review-panel-ok" : "review-panel"} role="status">
      <h3>{result.canStartDossier ? "Concept klaar" : "Controleer je invoer"}</h3>

      {result.errors.length > 0 ? (
        <ul className="review-list">
          {result.errors.map((issue) => (
            <li key={issue.id}>{issue.message}</li>
          ))}
        </ul>
      ) : (
        <p>Je invoer is lokaal compleet. Er is nog niets verstuurd.</p>
      )}

      {result.warnings.length > 0 ? (
        <div className="review-warnings">
          <strong>Aandachtspunten</strong>
          <ul className="review-list">
            {result.warnings.map((issue) => (
              <li key={issue.id}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
