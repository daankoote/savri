import type { SignupSubmitResult } from "./signupSubmitClient";

export type SignupSubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; result: Extract<SignupSubmitResult, { ok: true }> }
  | { status: "error"; message: string };

type SignupSubmitStatusPanelProps = {
  state: SignupSubmitState;
};

export function SignupSubmitStatusPanel({ state }: SignupSubmitStatusPanelProps) {
  if (state.status === "idle") return null;

  if (state.status === "submitting") {
    return (
      <div className="review-panel" role="status" aria-live="polite">
        <h3>Aanmelding wordt verstuurd</h3>
        <p>Even geduld. Sluit dit venster niet tijdens het verzenden.</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="review-panel" role="alert">
        <h3>Aanmelding niet verstuurd</h3>
        <p>{state.message}</p>
      </div>
    );
  }

  return (
    <div className="review-panel review-panel-ok" role="status" aria-live="polite">
      <h3>Aanmelding ontvangen</h3>
      <p>ENVAL heeft je aanmelding ontvangen. Je dossier is aangemaakt voor beoordeling.</p>
      <p>
        <strong>Dossier ID:</strong> {state.result.dossier_id}
      </p>
      <p className="fine-print">Geen garantie op toekenning, opbrengst of termijn.</p>
    </div>
  );
}
