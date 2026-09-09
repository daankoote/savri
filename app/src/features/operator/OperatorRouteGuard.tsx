import { type ReactNode, useEffect } from "react";
import type { AppNavigate } from "../../routes/types.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { buildInternalLoginRoute } from "../auth/postLoginNavigation.ts";
import type {
  OperatorCapability,
  OperatorContext,
} from "./operatorContextClient.ts";
import { useOperatorContext } from "./useOperatorContext.ts";

type OperatorRouteGuardProps = Readonly<{
  children: (context: OperatorContext) => ReactNode;
  navigate: AppNavigate;
  requiredCapability: OperatorCapability;
  returnTo: string;
}>;

function GuardMessage({
  kind,
  message,
  onRetry,
}: Readonly<{
  kind: "loading" | "denied" | "error";
  message: string;
  onRetry?: () => void;
}>) {
  return (
    <main className="page-shell">
      <section className="section">
        <div className="container">
          <div
            className="review-panel"
            role={kind === "loading" ? "status" : "alert"}
            aria-live="polite"
          >
            <h3>{kind === "loading" ? "Beheer laden" : "Geen toegang"}</h3>
            <p>{message}</p>
            {onRetry
              ? (
                <div className="section-actions">
                  <button
                    className="button button-secondary"
                    onClick={onRetry}
                    type="button"
                  >
                    Opnieuw laden
                  </button>
                </div>
              )
              : null}
          </div>
        </div>
      </section>
    </main>
  );
}

export function OperatorRouteGuard({
  children,
  navigate,
  requiredCapability,
  returnTo,
}: OperatorRouteGuardProps) {
  const auth = useAuth();
  const operator = useOperatorContext(
    auth.status === "ready" ? auth.session?.access_token ?? null : null,
  );

  useEffect(() => {
    if (auth.status === "signed_out") {
      navigate(buildInternalLoginRoute(returnTo), { replace: true });
    }
  }, [auth.status, navigate, returnTo]);

  if (
    auth.status === "initializing" ||
    auth.status === "authenticated_unbound" ||
    auth.status === "bootstrapping" ||
    (auth.status === "ready" && operator.state.status === "loading")
  ) {
    return (
      <GuardMessage
        kind="loading"
        message="We controleren uw toegang."
      />
    );
  }
  if (auth.status === "error") {
    return (
      <GuardMessage
        kind="error"
        message={auth.error?.message ??
          "Inloggen is tijdelijk niet beschikbaar. Probeer het opnieuw."}
        onRetry={() => void auth.retryBootstrap()}
      />
    );
  }
  if (auth.status !== "ready") return null;
  if (operator.state.status === "denied") {
    return (
      <GuardMessage kind="denied" message={operator.state.error.message} />
    );
  }
  if (operator.state.status === "error") {
    return (
      <GuardMessage
        kind="error"
        message={operator.state.error.message}
        onRetry={operator.refresh}
      />
    );
  }
  if (operator.state.status !== "ready") return null;
  if (
    !operator.state.value.effectiveCapabilities.includes(requiredCapability)
  ) {
    return (
      <GuardMessage
        kind="denied"
        message="U heeft geen toegang tot beheer."
      />
    );
  }
  return <>{children(operator.state.value)}</>;
}
