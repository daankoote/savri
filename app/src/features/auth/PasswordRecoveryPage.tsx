import { useState, type FormEvent } from "react";
import type { AppNavigate } from "../../routes/types";
import { useAuth } from "./AuthProvider";
import { safeAuthError } from "./authErrorMapping";
import { AuthFeedbackPanel, AuthPageLayout, type AuthFeedback } from "./AuthPageLayout";
import { AUTH_ACCOUNT_ROUTE, AUTH_PASSWORD_REQUEST_ROUTE } from "./authUxFlow";

export function PasswordRecoveryPage({ navigate }: { navigate: AppNavigate }) {
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const unavailable = auth.status !== "initializing" &&
    auth.status !== "recovery_ready" && !passwordUpdated;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (password !== passwordConfirmation) {
      setFeedback({ kind: "error", message: safeAuthError("password_mismatch").message });
      return;
    }
    if (password.length < 8) {
      setFeedback({ kind: "error", message: safeAuthError("password_too_short").message });
      return;
    }

    setSubmitting(true);
    const result = await auth.updateRecoveredPassword(password);
    setSubmitting(false);

    if (!result.ok) {
      setFeedback({ kind: "error", message: result.error.message });
      return;
    }

    setPassword("");
    setPasswordConfirmation("");
    setPasswordUpdated(true);
    setFeedback({ kind: "info", message: "Uw wachtwoord is gewijzigd. Log opnieuw in." });
  }

  return (
    <AuthPageLayout
      action="Nieuw wachtwoord instellen"
      audience={auth.audience}
      helper="Kies een nieuw wachtwoord voor uw account."
    >
      {auth.status === "initializing" ? (
        <div className="review-panel" role="status" aria-live="polite">
          <p>Herstel-link controleren.</p>
        </div>
      ) : null}

      {auth.status === "recovery_ready" && !passwordUpdated ? (
        <form className="account-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Nieuw wachtwoord</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label className="field">
            <span>Nieuw wachtwoord herhalen</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
              type="password"
              value={passwordConfirmation}
            />
          </label>
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting ? "Even geduld..." : "Wachtwoord wijzigen"}
          </button>
        </form>
      ) : null}

      <AuthFeedbackPanel feedback={feedback} />

      {unavailable && !feedback ? (
        <div className="review-panel" role="alert">
          <p>{auth.error?.message || safeAuthError("recovery_link_invalid").message}</p>
        </div>
      ) : null}

      <div className="section-actions">
        <button className="button button-secondary" onClick={() => navigate(AUTH_ACCOUNT_ROUTE)} type="button">
          Naar inloggen
        </button>
        {unavailable ? (
          <button className="button button-secondary" onClick={() => navigate(AUTH_PASSWORD_REQUEST_ROUTE)} type="button">
            Nieuwe herstel-link aanvragen
          </button>
        ) : null}
      </div>
    </AuthPageLayout>
  );
}
