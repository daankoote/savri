import type {
  CustomerCorrectionHandoffItem,
  CustomerCorrectionReason,
} from "./customerCorrectionHandoffClient.ts";
import type { CustomerCorrectionHandoffState } from "./useCustomerCorrectionHandoff.ts";

const CUSTOMER_REASON_LABELS: Readonly<
  Record<CustomerCorrectionReason, string>
> = Object.freeze({
  MISSING_INFORMATION: "Gegeven ontbreekt",
  INCORRECT_INFORMATION: "Gegeven onjuist",
  INCONSISTENT_INFORMATION: "Gegevens komen niet overeen",
  OTHER: "Anders",
});

export function customerCorrectionReasonLabel(
  reason: CustomerCorrectionReason,
): string {
  return CUSTOMER_REASON_LABELS[reason];
}

function CorrectionItem(
  { item, index }: { item: CustomerCorrectionHandoffItem; index: number },
) {
  return (
    <article className="portal-evidence-card">
      <h3>{item.documentLabel}</h3>
      <dl className="portal-info-rows">
        <div className="portal-info-row">
          <dt>Onderdeel</dt>
          <dd>{item.factLabel}</dd>
        </div>
        <div className="portal-info-row">
          <dt>Reden</dt>
          <dd>{customerCorrectionReasonLabel(item.correctionReason)}</dd>
        </div>
        <div className="portal-info-row">
          <dt>Toelichting</dt>
          <dd>{item.correctionInstruction}</dd>
        </div>
      </dl>
      <span className="sr-only">Aanpassing {index + 1}</span>
    </article>
  );
}

export function CustomerCorrectionHandoffPanel(
  { state }: { state: CustomerCorrectionHandoffState },
) {
  if (state.status === "idle" || state.status === "loading") return null;

  if (state.status === "error") {
    return (
      <section
        className="portal-card-compact"
        aria-label="Dossieractie"
        role="alert"
      >
        <h2>Dossieractie niet beschikbaar</h2>
        <p>{state.error.message}</p>
        <div className="section-actions">
          <button
            className="button button-secondary button-compact"
            onClick={state.retry}
            type="button"
          >
            Opnieuw proberen
          </button>
        </div>
      </section>
    );
  }

  if (state.status !== "ready" || !state.model.handoff) return null;

  return (
    <section
      className="portal-card-compact"
      aria-labelledby="customer-correction-handoff-title"
    >
      <h2 id="customer-correction-handoff-title">Aanpassing nodig</h2>
      <div className="portal-evidence-grid">
        {state.model.handoff.items.map((item, index) => (
          <CorrectionItem
            index={index}
            item={item}
            key={`${item.documentLabel}:${item.factLabel}:${index}`}
          />
        ))}
      </div>
    </section>
  );
}
