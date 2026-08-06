import { useState } from "react";
import type { ConsentDraft, ValidationIssue } from "./signupTypes";
import { signupFieldErrorId } from "./signupValidation";

type LegalModalType = "terms" | "privacy" | "fee";

type ConsentSignatureSectionProps = {
  error: ValidationIssue | null;
  value: ConsentDraft;
  onChange: (value: ConsentDraft) => void;
};

const legalDrafts: Record<LegalModalType, { title: string; points: string[] }> =
  {
    terms: {
      title: "Algemene voorwaarden",
      points: [
        "ENVAL start een dossier op basis van de informatie die u aanlevert.",
        "U moet correcte en complete informatie aanleveren.",
        "ENVAL mag aanvullende informatie vragen.",
        "ENVAL geeft geen garantie op acceptatie, opbrengst, uitbetaling, timing, certificering of documentgoedkeuring.",
        "ENVAL mag stoppen of pauzeren als informatie onvolledig of niet bruikbaar is.",
        "Definitieve juridische tekst volgt vóór productie.",
      ],
    },
    privacy: {
      title: "Privacyverklaring",
      points: [
        "ENVAL verwerkt persoonsgegevens, zakelijke/VVE-gegevens en geüploade documenten.",
        "Verwerking gebeurt voor het beoordelen, opbouwen en beheren van het ERE-dossier.",
        "Documenten kunnen adres-, energie-, laadpaal-, MID- en KVK-bewijs bevatten.",
        "Gegevens worden geminimaliseerd of bewaard volgens toepasselijke bewaartermijnen.",
        "Definitieve juridische tekst volgt vóór productie.",
      ],
    },
    fee: {
      title: "ENVAL fee",
      points: [
        "De beoogde ENVAL succesfee is 10% wanneer resultaat of waarde wordt gerealiseerd.",
        "Geen gerealiseerd resultaat of waarde betekent onder het beoogde model geen succesfee, onder voorbehoud van finale voorwaarden.",
        "De exacte succestrigger, grondslag, btw, kosten, correcties, terugdraaiingen en clawback vragen nog finale juridische en commerciële review.",
        "Definitieve juridische tekst volgt vóór productie.",
      ],
    },
  };

export function ConsentSignatureSection(
  { error, value, onChange }: ConsentSignatureSectionProps,
) {
  const [activeModal, setActiveModal] = useState<LegalModalType | null>(null);
  const modal = activeModal ? legalDrafts[activeModal] : null;

  function updateAccepted(termsBundleAccepted: boolean) {
    onChange({ ...value, termsBundleAccepted });
  }

  return (
    <div className="consent-checklist" id="signup-agreements">
      <div className="consent-bundle-card">
        <input
          aria-describedby={error
            ? signupFieldErrorId(error.fieldPath)
            : undefined}
          aria-invalid={error ? true : undefined}
          checked={value.termsBundleAccepted}
          id="termsBundleAccepted"
          onChange={(event) => updateAccepted(event.currentTarget.checked)}
          type="checkbox"
        />
        <p>
          <label htmlFor="termsBundleAccepted">Ik ga akkoord met de</label>
          {"\u00a0"}
          <button
            className="button-link"
            onClick={() => setActiveModal("terms")}
            type="button"
          >
            algemene voorwaarden
          </button>
          <span>,{"\u00a0"}</span>
          <button
            className="button-link"
            onClick={() => setActiveModal("privacy")}
            type="button"
          >
            privacyverklaring
          </button>
          <span>{"\u00a0"}en{"\u00a0"}</span>
          <button
            className="button-link"
            onClick={() => setActiveModal("fee")}
            type="button"
          >
            ENVAL fee
          </button>
          <span>.</span>
        </p>
      </div>
      {error
        ? (
          <small
            className="field-message"
            id={signupFieldErrorId(error.fieldPath)}
            role="alert"
          >
            {error.message}
          </small>
        )
        : null}

      {modal
        ? (
          <div className="modal-backdrop" role="presentation">
            <section
              aria-labelledby="legal-modal-title"
              aria-modal="true"
              className="modal-panel"
              role="dialog"
            >
              <div className="modal-header">
                <h3 id="legal-modal-title">{modal.title}</h3>
                <button
                  className="button button-ghost button-compact"
                  onClick={() => setActiveModal(null)}
                  type="button"
                >
                  Sluiten
                </button>
              </div>
              <ul className="modal-list">
                {modal.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </section>
          </div>
        )
        : null}
    </div>
  );
}
