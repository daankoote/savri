import type { ReactNode } from "react";

export type AuthFeedback = {
  kind: "info" | "error";
  message: string;
};

type AuthPageLayoutProps = {
  action: string;
  children: ReactNode;
  helper: string;
};

export function AuthPageLayout({ action, children, helper }: AuthPageLayoutProps) {
  return (
    <main className="page-shell">
      <section className="section">
        <div className="container account-layout">
          <div className="page-intro">
            <h1>{action}</h1>
            <p>{helper}</p>
          </div>
          <section className="signup-section account-card" aria-label={action}>
            {children}
          </section>
        </div>
      </section>
    </main>
  );
}

export function AuthFeedbackPanel({ feedback }: { feedback: AuthFeedback | null }) {
  if (!feedback) return null;

  return (
    <div
      className={feedback.kind === "error" ? "review-panel" : "review-panel review-panel-ok"}
      role="status"
    >
      <p>{feedback.message}</p>
    </div>
  );
}
