import type { ReactNode } from "react";
import {
  DOCUMENT_FIRST_STEPS,
  type DocumentFirstStepId,
} from "./documentFirstSignupSelectors";

type DocumentFirstSignupFlowProps = {
  activeStep: DocumentFirstStepId;
  maximumReachableStepIndex: number;
  onStepChange: (step: DocumentFirstStepId) => void;
  children: ReactNode;
};

export function DocumentFirstSignupFlow({
  activeStep,
  children,
  maximumReachableStepIndex,
  onStepChange,
}: DocumentFirstSignupFlowProps) {
  return (
    <div
      className="signup-flow signup-flow-compact signup-flow-document-first"
      id="signup-flow-top"
    >
      <nav className="mode-tabs" aria-label="Aanmelden">
        {DOCUMENT_FIRST_STEPS.map((step, index) => (
          <button
            aria-current={step.id === activeStep ? "step" : undefined}
            aria-pressed={step.id === activeStep}
            className={step.id === activeStep
              ? "mode-tab mode-tab-active"
              : "mode-tab"}
            disabled={index > maximumReachableStepIndex}
            key={step.id}
            onClick={() => onStepChange(step.id)}
            type="button"
          >
            {index + 1}. {step.label}
          </button>
        ))}
      </nav>
      {children}
    </div>
  );
}
