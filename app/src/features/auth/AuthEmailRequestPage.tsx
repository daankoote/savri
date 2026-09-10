import { useEffect, useState, type FormEvent } from "react";
import type { AppNavigate } from "../../routes/types";
import {
  requestSupabasePasswordRecovery,
  resendSupabaseVerificationEmail,
} from "./authClient";
import { useAuth } from "./AuthProvider";
import { AuthFeedbackPanel, AuthPageLayout, type AuthFeedback } from "./AuthPageLayout";
import {
  AUTH_ACCOUNT_ROUTE,
  getResendCooldownSeconds,
  PASSWORD_RECOVERY_REQUESTED_MESSAGE,
  RESEND_COOLDOWN_MS,
  VERIFICATION_RESEND_REQUESTED_MESSAGE,
  type AuthPageKind,
} from "./authUxFlow";

type AuthEmailRequestPageProps = {
  kind: Extract<AuthPageKind, "password_request" | "verification_resend">;
  navigate: AppNavigate;
};

export function AuthEmailRequestPage({ kind, navigate }: AuthEmailRequestPageProps) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownClock, setCooldownClock] = useState(() => Date.now());
  const isResend = kind === "verification_resend";
  const cooldownSeconds = getResendCooldownSeconds(cooldownUntil, cooldownClock);
  const copy = isResend
    ? {
      action: "Geen verificatiemail ontvangen?",
      helper: "Voor een accountregistratie die nog niet is bevestigd, kunt u de verificatiemail opnieuw aanvragen.",
      message: VERIFICATION_RESEND_REQUESTED_MESSAGE,
      submit: "Verificatiemail versturen",
    }
    : {
      action: "Wachtwoord herstellen",
      helper: "Vul uw e-mailadres in om een herstel-link aan te vragen.",
      message: PASSWORD_RECOVERY_REQUESTED_MESSAGE,
      submit: "Herstel-link aanvragen",
    };

  useEffect(() => {
    if (!isResend || cooldownSeconds === 0) return;

    const intervalId = window.setInterval(() => setCooldownClock(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [cooldownSeconds, isResend]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setSubmitting(true);

    try {
      if (isResend) {
        await resendSupabaseVerificationEmail(email);
      } else {
        await requestSupabasePasswordRecovery(email);
      }
    } catch {
      // The outward response remains neutral for every request outcome.
    }

    if (isResend) {
      const now = Date.now();
      setCooldownClock(now);
      setCooldownUntil(now + RESEND_COOLDOWN_MS);
    }

    setSubmitting(false);
    setFeedback({ kind: "info", message: copy.message });
  }

  return (
    <AuthPageLayout action={copy.action} audience={auth.audience} helper={copy.helper}>
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
        <button
          className="button button-primary"
          disabled={submitting || cooldownSeconds > 0}
          type="submit"
        >
          {submitting
            ? "Even geduld..."
            : cooldownSeconds > 0
            ? `Opnieuw versturen (${cooldownSeconds}s)`
            : copy.submit}
        </button>
      </form>

      <AuthFeedbackPanel feedback={feedback} />

      <div className="section-actions">
        <button className="button button-secondary" onClick={() => navigate(AUTH_ACCOUNT_ROUTE)} type="button">
          Naar inloggen
        </button>
      </div>
    </AuthPageLayout>
  );
}
