import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AppNavigate } from "../../routes/types";
import { AuthEmailRequestPage } from "./AuthEmailRequestPage";
import { AuthFeedbackPanel, AuthPageLayout, type AuthFeedback } from "./AuthPageLayout";
import { useAuth } from "./AuthProvider";
import { safeAuthError } from "./authErrorMapping";
import {
  AUTH_PASSWORD_REQUEST_ROUTE,
  AUTH_VERIFICATION_RESEND_ROUTE,
  resolveAuthPageKind,
} from "./authUxFlow";
import type { AuthMode, AuthSafeError } from "./authTypes";
import { PasswordRecoveryPage } from "./PasswordRecoveryPage";
import { resolvePostLoginDestination } from "./postLoginNavigation";

type AccountPageContentProps = {
  currentPath: string;
  navigate: AppNavigate;
};

function modeCopy(mode: AuthMode) {
  if (mode === "activate") {
    return {
      action: "Account aanmaken",
      helper: "Maak een account aan voor het ENVAL-klantportaal. Een aanvraag kan daarna worden gestart.",
      submit: "Account aanmaken",
    };
  }

  return {
    action: "Inloggen",
    helper: "Log in om uw dossierstatus en acties te bekijken.",
    submit: "Inloggen",
  };
}

function safeErrorText(error: AuthSafeError | null) {
  return error?.message || "Inloggen is tijdelijk niet beschikbaar. Probeer het opnieuw.";
}

function AccountAccessPage({ navigate }: { navigate: AppNavigate }) {
  const auth = useAuth();
  const [mode, setMode] = useState<AuthMode>(() =>
    auth.audience === "customer" && window.location.hash === "#activeren"
      ? "activate"
      : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hasNavigatedRef = useRef(false);
  const copy = modeCopy(mode);
  const postLoginDestination = resolvePostLoginDestination(window.location.search);
  const navigateAfterAuthentication = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    navigate(postLoginDestination, { replace: true });
  }, [navigate, postLoginDestination]);

  useEffect(() => {
    if (auth.status === "ready") navigateAfterAuthentication();
  }, [auth.status, navigateAfterAuthentication]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (auth.audience === "customer" && mode === "activate") {
      if (password !== passwordConfirmation) {
        setFeedback({ kind: "error", message: safeAuthError("password_mismatch").message });
        return;
      }
      if (password.length < 8) {
        setFeedback({ kind: "error", message: safeAuthError("password_too_short").message });
        return;
      }
    }

    setSubmitting(true);

    const result = auth.audience === "customer" && mode === "activate"
      ? await auth.signUpWithPassword(email, password)
      : await auth.signInWithPassword(email, password);

    setSubmitting(false);
    if (!result.ok) {
      if (mode === "activate" && result.error.code === "account_already_exists") {
        setMode("signin");
        setFeedback({ kind: "info", message: "Dit account bestaat al. Log in om verder te gaan." });
        return;
      }
      setFeedback({ kind: "error", message: result.error.message });
      return;
    }
    if (result.status === "verification_required") {
      setFeedback({ kind: "info", message: "Controleer uw e-mail om het account te bevestigen." });
      return;
    }
    navigateAfterAuthentication();
  }

  if (auth.status === "ready") {
    return (
      <main className="page-shell">
        <section className="section">
          <div className="container">
            <div className="review-panel" role="status" aria-live="polite">
              <h3>{auth.audience === "operator" ? "Beheer" : "Klantportaal openen"}</h3>
              <p>{auth.audience === "operator" ? "Even geduld." : "We openen uw dashboard."}</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AuthPageLayout action={copy.action} helper={copy.helper}>
      {auth.audience === "customer" ? (
        <div className="mode-tabs" aria-label="Account modus">
          <button
            className={mode === "signin" ? "mode-tab mode-tab-active" : "mode-tab"}
            onClick={() => {
              setMode("signin");
              setFeedback(null);
            }}
            type="button"
          >
            Inloggen
          </button>
          <button
            className={mode === "activate" ? "mode-tab mode-tab-active" : "mode-tab"}
            onClick={() => {
              setMode("activate");
              setFeedback(null);
            }}
            type="button"
          >
            Account aanmaken
          </button>
        </div>
      ) : null}

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
            autoComplete={mode === "activate" ? "new-password" : "current-password"}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {auth.audience === "customer" && mode === "activate" ? (
          <label className="field">
            <span>Wachtwoord herhalen</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
              type="password"
              value={passwordConfirmation}
            />
          </label>
        ) : null}
        <button
          className="button button-primary"
          disabled={submitting || auth.status === "bootstrapping"}
          type="submit"
        >
          {submitting || auth.status === "bootstrapping" ? "Even geduld..." : copy.submit}
        </button>
      </form>

      <AuthFeedbackPanel feedback={feedback} />

      {auth.status === "error" && !feedback ? (
        <div className="review-panel" role="alert">
          <p>{safeErrorText(auth.error)}</p>
        </div>
      ) : null}

      <div className="section-actions">
        <button className="button button-secondary" onClick={() => navigate(AUTH_PASSWORD_REQUEST_ROUTE)} type="button">
          Wachtwoord vergeten
        </button>
        {auth.audience === "customer" ? (
          <button className="button button-secondary" onClick={() => navigate(AUTH_VERIFICATION_RESEND_ROUTE)} type="button">
            Geen verificatiemail ontvangen?
          </button>
        ) : null}
      </div>
    </AuthPageLayout>
  );
}

export function AccountPageContent({ currentPath, navigate }: AccountPageContentProps) {
  const pageKind = resolveAuthPageKind(currentPath);
  if (pageKind === "password_request" || pageKind === "verification_resend") {
    return <AuthEmailRequestPage kind={pageKind} navigate={navigate} />;
  }
  if (pageKind === "password_update") return <PasswordRecoveryPage navigate={navigate} />;
  return <AccountAccessPage navigate={navigate} />;
}
