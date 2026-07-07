import { useState } from "react";
import type { ConsentDraft } from "./signupTypes";

type LegalModalType = "terms" | "privacy" | "fee";

type ConsentSignatureSectionProps = {
  value: ConsentDraft;
  onChange: (value: ConsentDraft) => void;
};

const legalDrafts: Record<LegalModalType, { title: string; points: string[] }> = {
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

export function ConsentSignatureSection({ value, onChange }: ConsentSignatureSectionProps) {
  const [activeModal, setActiveModal] = useState<LegalModalType | null>(null);
  const modal = activeModal ? legalDrafts[activeModal] : null;

  function updateAccepted(termsBundleAccepted: boolean) {
    onChange({ ...value, termsBundleAccepted });
  }

  return (
    <section className="signup-section" aria-labelledby="consent-signature-title">
      <div className="signup-section-header">
        <p className="eyebrow">Stap 4</p>
        <h2 id="consent-signature-title">Toestemming en voorwaarden</h2>
        <p>Controleer en bevestig de voorwaarden voordat ENVAL uw dossier kan starten.</p>
      </div>

      <div className="consent-bundle-card">
        <input
          checked={value.termsBundleAccepted}
          id="termsBundleAccepted"
          onChange={(event) => updateAccepted(event.currentTarget.checked)}
          type="checkbox"
        />
        <p>
          <label htmlFor="termsBundleAccepted">Ik ga akkoord met de </label>
          <button className="button-link" onClick={() => setActiveModal("terms")} type="button">
            algemene voorwaarden
          </button>
          <span>, </span>
          <button className="button-link" onClick={() => setActiveModal("privacy")} type="button">
            privacyverklaring
          </button>
          <span> en </span>
          <button className="button-link" onClick={() => setActiveModal("fee")} type="button">
            ENVAL fee
          </button>
          <span>.</span>
        </p>
      </div>

      {modal ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="legal-modal-title"
            aria-modal="true"
            className="modal-panel"
            role="dialog"
          >
            <div className="modal-header">
              <h3 id="legal-modal-title">{modal.title}</h3>
              <button className="button button-ghost button-compact" onClick={() => setActiveModal(null)} type="button">
                Sluiten
              </button>
            </div>
            <ul className="modal-list">
              {modal.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </section>
  );
}
