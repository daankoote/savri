import { useMemo, useState } from "react";
import type { DocumentFirstSignupDraft } from "./documentFirstSignupModel";
import { FactTable } from "./presentation/FactTable";
import { selectUnifiedFactPresentation } from "./presentation/factPresentationModel";
import { createBrowserHtmlLegalBundleV1 } from "./signing/browserHtmlLegalBundleV1";
import { createLegalBundleDocument } from "./signing/legalBundleDocument";
import {
  EMPTY_LEGAL_ACTION_STATE,
  listLegalDocuments,
} from "./signing/legalDocumentRegistry";
import { MandateDocument } from "./signing/MandateDocument";
import { getMandateYearOptions } from "./signing/mandateDocumentModel";
import { SignerPanel } from "./signing/SignerPanel";
import { SigningLegalBundle } from "./signing/SigningLegalBundle";
import { SigningEntityGroup } from "./signing/SigningEntityGroup";
import { createSigningIntent } from "./signing/signingIntent";
import { getActiveSignupSignatureMethod } from "./signing/signupSigningComposition";

export function DocumentFirstSigningSummary(
  { draft }: { draft: DocumentFirstSignupDraft },
) {
  const presentation = selectUnifiedFactPresentation(draft);
  const method = getActiveSignupSignatureMethod();
  const legalDocuments = useMemo(() => listLegalDocuments(), []);
  const exporter = useMemo(() => createBrowserHtmlLegalBundleV1(), []);
  const yearOptions = getMandateYearOptions();
  const [summaryConfirmed, setSummaryConfirmed] = useState(false);
  const [mandateYear, setMandateYear] = useState<number | null>(null);
  const [legalActions, setLegalActions] = useState(EMPTY_LEGAL_ACTION_STATE);
  const [signerInput, setSignerInput] = useState({
    accountType: draft.accountBasis.accountType,
    fullName: "",
    role: "",
    intentAccepted: false,
  });
  const signingIntent = useMemo(() =>
    createSigningIntent({
      accountType: draft.accountBasis.accountType,
      presentation,
      signerInput,
      summaryConfirmed,
      selectedMethod: method,
      legalDocuments,
      legalActions,
      mandateYear,
      evidence: null,
    }), [
    draft.accountBasis.accountType,
    legalActions,
    legalDocuments,
    mandateYear,
    method,
    presentation,
    signerInput,
    summaryConfirmed,
  ]);
  const legalBundle = useMemo(
    () =>
      signingIntent.mandate
        ? createLegalBundleDocument({
          documents: legalDocuments,
          mandate: signingIntent.mandate,
        })
        : null,
    [legalDocuments, signingIntent.mandate],
  );
  const documentRows = presentation.documents.rows.map((row) => {
    const binding = row.sources[0]?.binding;
    return {
      ...row,
      label: binding ? `${row.label} · ${binding}` : row.label,
    };
  });

  return (
    <article className="signing-document">
      <section className="signing-kiss-section" id="signup-summary">
        <header className="signing-document__header">
          <h3>Samenvatting</h3>
          <p>
            Controleer hieronder de gegevens die uit uw invoer en documenten
            zijn samengebracht.
          </p>
        </header>
        <div className="signing-document__subsection">
          <h4>Account</h4>
          <FactTable
            columns={{ judgment: null, sources: null }}
            rows={presentation.account.rows}
            variant="document"
          />
        </div>
        {presentation.locations.map((location, locationIndex) => (
          <SigningEntityGroup
            chargers={presentation.chargers.filter((charger) =>
              charger.locationId === location.locationId
            )}
            groupTitle={location.title}
            key={location.id}
            location={location}
            locationTitle={`Locatie ${locationIndex + 1}`}
          />
        ))}
        <div className="signing-document__subsection">
          <h4>{presentation.documents.title}</h4>
          <FactTable
            columns={{
              judgment: null,
              label: "Documentsoort",
              sources: null,
              value: "Bestandsnaam",
            }}
            rows={documentRows}
            variant="document"
          />
        </div>
        <label className="consent-check-item">
          <input
            checked={summaryConfirmed}
            onChange={(event) =>
              setSummaryConfirmed(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>
            Ik bevestig dat de bovenstaande gegevens juist en volledig zijn.
          </span>
        </label>
      </section>
      {signingIntent.mandate && legalBundle
        ? (
          <div className="signing-blocks">
            <MandateDocument
              model={signingIntent.mandate}
              onPreviewDocuments={() => exporter.preview(legalBundle)}
              onYearChange={setMandateYear}
              selectedYear={mandateYear}
              yearOptions={yearOptions}
            />
            <SigningLegalBundle
              actions={legalActions}
              bundle={legalBundle}
              exporter={exporter}
              onChange={setLegalActions}
            />
            <SignerPanel
              onChange={setSignerInput}
              organizationName={signingIntent.mandate.mandatingParty
                .organizationName}
              value={signerInput}
            />
          </div>
        )
        : null}
      <div
        aria-hidden="true"
        className="signing-primary-action-boundary"
      />
    </article>
  );
}
