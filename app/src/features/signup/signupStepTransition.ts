import type { DocumentFirstStepId } from "./documentFirstSignupSelectors";

const STEP_TITLE_IDS: Record<DocumentFirstStepId, string> = {
  account: "document-first-account-title",
  documents: "document-first-documents-title",
  signing: "document-first-signing-title",
};

type FocusTarget = {
  focus: (options?: FocusOptions) => void;
  setAttribute: (name: string, value: string) => void;
};

type ScrollTarget = {
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
};

export type SignupStepTransitionEnvironment = {
  getElementById: (id: string) => (FocusTarget & ScrollTarget) | null;
  prefersReducedMotion: () => boolean;
  schedule: (callback: () => void) => void;
};

export function signupStepScrollBehavior(
  _prefersReducedMotion: boolean,
): ScrollBehavior {
  return "auto";
}

function browserEnvironment(): SignupStepTransitionEnvironment {
  return {
    getElementById: (id) => document.getElementById(id),
    prefersReducedMotion: () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    schedule: (callback) => window.requestAnimationFrame(callback),
  };
}

export function transitionSignupStep(
  step: DocumentFirstStepId,
  setActiveStep: (step: DocumentFirstStepId) => void,
  environment: SignupStepTransitionEnvironment = browserEnvironment(),
): void {
  setActiveStep(step);
  environment.schedule(() => {
    environment.getElementById("signup-flow-top")?.scrollIntoView({
      behavior: signupStepScrollBehavior(environment.prefersReducedMotion()),
      block: "start",
    });
    const title = environment.getElementById(STEP_TITLE_IDS[step]);
    title?.setAttribute("tabindex", "-1");
    title?.focus({ preventScroll: true });
  });
}
