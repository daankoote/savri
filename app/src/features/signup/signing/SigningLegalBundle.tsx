import type { LegalBundleDocument } from "./legalBundleDocument";
import type { LegalBundleExportPort } from "./legalBundleExportPort";
import {
  type LegalActionState,
  legalBundleActionState,
} from "./legalDocumentRegistry";

type SigningLegalBundleProps = {
  actions: LegalActionState;
  bundle: LegalBundleDocument;
  exporter: LegalBundleExportPort;
  onChange: (actions: LegalActionState) => void;
};

export function SigningLegalBundle({
  actions,
  bundle,
  exporter,
  onChange,
}: SigningLegalBundleProps) {
  const confirmed = actions.privacyNoticeRead &&
    actions.serviceTermsAccepted && actions.feeTermsAccepted;
  return (
    <section className="signing-kiss-section" id="signup-legal-bundle">
      <h3>Voorwaarden en privacy</h3>
      <ul>
        <li>Privacyverklaring</li>
        <li>Algemene voorwaarden</li>
        <li>Vergoedingsvoorwaarden</li>
      </ul>
      <div className="signing-document__actions">
        <button
          className="button button-secondary"
          onClick={() => exporter.preview(bundle)}
          type="button"
        >
          Documenten bekijken
        </button>
        <button
          className="button button-secondary"
          onClick={() => exporter.download(bundle)}
          type="button"
        >
          Download documenten
        </button>
      </div>
      <label className="consent-check-item">
        <input
          checked={confirmed}
          onChange={(event) =>
            onChange(legalBundleActionState(
              event.currentTarget.checked,
              actions,
            ))}
          type="checkbox"
        />
        <span>
          Ik heb de privacyverklaring gelezen en ga akkoord met de algemene
          voorwaarden en de vergoedingsvoorwaarden.
        </span>
      </label>
    </section>
  );
}
