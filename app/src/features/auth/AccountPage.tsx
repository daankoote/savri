import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AppNavigate } from "../../routes/types";
import { AuthEmailRequestPage } from "./AuthEmailRequestPage";
import {
  type AuthFeedback,
  AuthFeedbackPanel,
  AuthPageLayout,
} from "./AuthPageLayout";
import { useAuth } from "./AuthProvider";
import { safeAuthError } from "./authErrorMapping";
import {
  AUTH_PASSWORD_REQUEST_ROUTE,
  AUTH_VERIFICATION_RESEND_ROUTE,
  completeAuthLogout,
  resolveAuthPageKind,
} from "./authUxFlow";
import type {
  AuthMode,
  AuthorizedPortalNavigation,
  AuthSafeError,
} from "./authTypes";
import { PasswordRecoveryPage } from "./PasswordRecoveryPage";
import {
  readRequestedPortal,
  resolveAuthorizedPostLoginDecision,
} from "./postLoginNavigation";
import {
  formatPresentationBrandCopy,
  usePresentationBrand,
} from "../../shared/presentation/PresentationBrandProvider";

type AccountPageContentProps = {
  currentPath: string;
  navigate: AppNavigate;
};

function modeCopy(mode: AuthMode, displayName: string) {
  if (mode === "activate") {
    return {
      action: "Account aanmaken",
      helper:
        `Maak een account aan voor het ${displayName}-klantportaal. Een aanvraag kan daarna worden gestart.`,
      submit: "Account aanmaken",
    };
  }

  return {
    action: "Inloggen",
    helper: "Log in om uw dossierstatus en acties te bekijken.",
    submit: "Inloggen",
  };
}

function safeErrorText(error: AuthSafeError | null, displayName: string) {
  return formatPresentationBrandCopy(
    error?.message ||
      "Inloggen is tijdelijk niet beschikbaar. Probeer het opnieuw.",
    displayName,
  );
}

function AccountAccessPage({ navigate }: { navigate: AppNavigate }) {
  const auth = useAuth();
  const presentation = usePresentationBrand();
  const requestedPortal = readRequestedPortal(window.location.search);
  const showCustomerAccountActions = auth.audience === "customer" ||
    (auth.audience === "portal" && requestedPortal !== "workforce");
  const [mode, setMode] = useState<AuthMode>(() =>
    showCustomerAccountActions && window.location.hash === "#activeren"
      ? "activate"
      : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hasNavigatedRef = useRef(false);
  const logoutRunningRef = useRef(false);
  const copy = modeCopy(mode, presentation.displayName);
  const portalNavigation: AuthorizedPortalNavigation = auth.audience ===
      "portal"
    ? auth.portalNavigation ?? {
      portals: [],
      customerCaseReferences: [],
      workforceCaseReferences: [],
      workforceDefaultDestination: null,
      workforceEvidenceReview: false,
      workforceCompliance: false,
    }
    : {
      portals: auth.audience === "operator" ? ["workforce"] : ["customer"],
      customerCaseReferences:
        auth.summary?.dossiers.map((dossier) => dossier.case_reference) ?? [],
      workforceCaseReferences: [],
      workforceDefaultDestination: auth.audience === "operator"
        ? "/beheer"
        : null,
      workforceEvidenceReview: auth.audience === "operator",
      workforceCompliance: false,
    };
  const postLoginDecision = resolveAuthorizedPostLoginDecision(
    window.location.search,
    portalNavigation,
  );
  const navigateAfterAuthentication = useCallback((destination: string) => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    navigate(destination, { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (auth.status === "ready" && postLoginDecision.kind === "redirect") {
      navigateAfterAuthentication(postLoginDecision.destination);
    }
  }, [auth.status, navigateAfterAuthentication, postLoginDecision]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (showCustomerAccountActions && mode === "activate") {
      if (password !== passwordConfirmation) {
        setFeedback({
          kind: "error",
          message: safeAuthError("password_mismatch").message,
        });
        return;
      }
      if (password.length < 8) {
        setFeedback({
          kind: "error",
          message: safeAuthError("password_too_short").message,
        });
        return;
      }
    }

    setSubmitting(true);

    const result = showCustomerAccountActions && mode === "activate"
      ? await auth.signUpWithPassword(email, password)
      : await auth.signInWithPassword(email, password);

    setSubmitting(false);
    if (!result.ok) {
      if (
        mode === "activate" && result.error.code === "account_already_exists"
      ) {
        setMode("signin");
        setFeedback({
          kind: "info",
          message: "Dit account bestaat al. Log in om verder te gaan.",
        });
        return;
      }
      setFeedback({ kind: "error", message: result.error.message });
      return;
    }
    if (result.status === "verification_required") {
      setFeedback({
        kind: "info",
        message: "Controleer uw e-mail om het account te bevestigen.",
      });
      return;
    }
  }

  async function handleNoAccessLogout() {
    if (logoutRunningRef.current) return;
    logoutRunningRef.current = true;
    setSubmitting(true);
    setFeedback(null);
    const signedOut = await completeAuthLogout({
      navigate,
      signOut: auth.signOut,
    });
    if (signedOut) {
      logoutRunningRef.current = false;
      setMode("signin");
      setEmail("");
      setPassword("");
      setPasswordConfirmation("");
      setSubmitting(false);
      return;
    }
    logoutRunningRef.current = false;
    setSubmitting(false);
    setFeedback({
      kind: "error",
      message: "Uitloggen is tijdelijk niet beschikbaar. Probeer het opnieuw.",
    });
  }

  if (auth.status === "ready") {
    if (postLoginDecision.kind === "choose") {
      return (
        <AuthPageLayout
          action="Kies een portaal"
          focusHeading
          helper="Kies waar u verder wilt gaan."
        >
          <div className="section-actions">
            {postLoginDecision.portals.includes("customer")
              ? (
                <button
                  className="button button-primary"
                  onClick={() => navigateAfterAuthentication("/dashboard")}
                  type="button"
                >
                  Klantportaal
                </button>
              )
              : null}
            {postLoginDecision.portals.includes("workforce") &&
                portalNavigation.workforceDefaultDestination
              ? (
                <button
                  className="button button-primary"
                  onClick={() =>
                    navigateAfterAuthentication(
                      portalNavigation.workforceDefaultDestination!,
                    )}
                  type="button"
                >
                  Dossierbeheer
                </button>
              )
              : null}
          </div>
        </AuthPageLayout>
      );
    }

    if (postLoginDecision.kind === "denied") {
      return (
        <AuthPageLayout
          action="Geen toegang"
          focusHeading
          helper="U bent ingelogd, maar dit account heeft geen toegang tot een portaal."
        >
          <button
            aria-busy={submitting}
            className="button button-secondary"
            disabled={submitting}
            onClick={() => void handleNoAccessLogout()}
            type="button"
          >
            {submitting ? "Even geduld..." : "Ander account gebruiken"}
          </button>
          <AuthFeedbackPanel feedback={feedback} />
        </AuthPageLayout>
      );
    }

    return (
      <main className="page-shell">
        <section className="section">
          <div className="container">
            <div className="review-panel" role="status" aria-live="polite">
              <h3>
                {auth.audience === "operator"
                  ? "Beheer"
                  : auth.audience === "customer"
                  ? "Klantportaal openen"
                  : "Portaal openen"}
              </h3>
              <p>
                {auth.audience === "customer"
                  ? "We openen uw dashboard."
                  : "Even geduld."}
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AuthPageLayout action={copy.action} helper={copy.helper}>
      {showCustomerAccountActions
        ? (
          <div className="mode-tabs" aria-label="Account modus">
            <button
              className={mode === "signin"
                ? "mode-tab mode-tab-active"
                : "mode-tab"}
              onClick={() => {
                setMode("signin");
                setFeedback(null);
              }}
              type="button"
            >
              Inloggen
            </button>
            <button
              className={mode === "activate"
                ? "mode-tab mode-tab-active"
                : "mode-tab"}
              onClick={() => {
                setMode("activate");
                setFeedback(null);
              }}
              type="button"
            >
              Account aanmaken
            </button>
          </div>
        )
        : null}

      <form className="account-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>E-mailadres</span>
          <input
            autoComplete="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="field">
          <span>Wachtwoord</span>
          <input
            autoComplete={mode === "activate"
              ? "new-password"
              : "current-password"}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {showCustomerAccountActions && mode === "activate"
          ? (
            <label className="field">
              <span>Wachtwoord herhalen</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) =>
                  setPasswordConfirmation(event.target.value)}
                required
                type="password"
                value={passwordConfirmation}
              />
            </label>
          )
          : null}
        <button
          className="button button-primary"
          disabled={submitting || auth.status === "bootstrapping"}
          type="submit"
        >
          {submitting || auth.status === "bootstrapping"
            ? "Even geduld..."
            : copy.submit}
        </button>
      </form>

      <AuthFeedbackPanel feedback={feedback} />

      {auth.status === "error" && !feedback
        ? (
          <div className="review-panel" role="alert">
            <p>{safeErrorText(auth.error, presentation.displayName)}</p>
          </div>
        )
        : null}

      <div className="section-actions">
        <button
          className="button button-secondary"
          onClick={() => navigate(AUTH_PASSWORD_REQUEST_ROUTE)}
          type="button"
        >
          Wachtwoord vergeten
        </button>
        {showCustomerAccountActions
          ? (
            <button
              className="button button-secondary"
              onClick={() => navigate(AUTH_VERIFICATION_RESEND_ROUTE)}
              type="button"
            >
              Geen verificatiemail ontvangen?
            </button>
          )
          : null}
      </div>
    </AuthPageLayout>
  );
}

export function AccountPageContent(
  { currentPath, navigate }: AccountPageContentProps,
) {
  const pageKind = resolveAuthPageKind(currentPath);
  if (pageKind === "password_request" || pageKind === "verification_resend") {
    return <AuthEmailRequestPage kind={pageKind} navigate={navigate} />;
  }
  if (pageKind === "password_update") {
    return <PasswordRecoveryPage navigate={navigate} />;
  }
  return <AccountAccessPage navigate={navigate} />;
}
