import {
  DOCUMENT_FIRST_STEPS,
  type DocumentFirstStepId,
} from "./documentFirstSignupSelectors";

type SignupFlowNavigationProps = {
  activeStep: DocumentFirstStepId;
  canContinue: boolean;
  onStepChange: (step: DocumentFirstStepId) => void;
};

export function SignupFlowNavigation({
  activeStep,
  canContinue,
  onStepChange,
}: SignupFlowNavigationProps) {
  const index = DOCUMENT_FIRST_STEPS.findIndex((step) =>
    step.id === activeStep
  );
  const previous = DOCUMENT_FIRST_STEPS[index - 1];
  const next = DOCUMENT_FIRST_STEPS[index + 1];
  return (
    <footer className="signup-flow-navigation" aria-label="Stapnavigatie">
      <div>
        {previous
          ? (
            <button
              className="button button-secondary"
              onClick={() => onStepChange(previous.id)}
              type="button"
            >
              Vorige
            </button>
          )
          : null}
      </div>
      <div>
        {next
          ? (
            <button
              className="button button-primary"
              disabled={!canContinue}
              onClick={() => onStepChange(next.id)}
              type="button"
            >
              Volgende
            </button>
          )
          : null}
      </div>
    </footer>
  );
}
