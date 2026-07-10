import { useMemo, useState } from "react";
import type { RoutedPageProps } from "../../routes/types";
import { AppHeader } from "../../shared/components/AppHeader";
import { ChargerDocumentsSection } from "./ChargerDocumentsSection";
import { ChargerInfoSection } from "./ChargerInfoSection";
import { ConsentSignatureSection } from "./ConsentSignatureSection";
import { PersonalInfoSection } from "./PersonalInfoSection";
import { SignupReviewPanel } from "./SignupReviewPanel";
import { SignupSubmitStatusPanel, type SignupSubmitState } from "./SignupSubmitStatusPanel";
import {
  createChargerDraft,
  createConsentDraft,
  createDocumentDraftsForCharger,
  createLocationDraft,
  createPersonalInfoDraft,
} from "./signupNormalizers";
import { buildSignupSubmitClientConfig } from "./signupSubmitConfig";
import { submitSignupPayload } from "./signupSubmitClient";
import { mapSignupDraftToSubmitPayload } from "./signupSubmitMapper";
import type {
  AddressDraft,
  ChargerDocumentDraft,
  ChargerDraft,
  ConsentDraft,
  DocumentsByChargerId,
  PersonalInfoDraft,
  SignupLocationDraft,
  SignupTab,
  SignupValidationResult,
} from "./signupTypes";
import { validateSignupDraft } from "./signupValidation";

const firstLocation = createLocationDraft();

function createInitialDocuments(): DocumentsByChargerId {
  return Object.fromEntries(
    firstLocation.chargers.map((charger) => [
      charger.clientId,
      createDocumentDraftsForCharger(charger.clientId),
    ]),
  );
}

function createSignupIdempotencyKey(): string {
  if (crypto.randomUUID) {
    return `signup-submit-${crypto.randomUUID()}`;
  }

  return `signup-submit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function SignupPageShell({ currentPath, navigate }: RoutedPageProps) {
  const [personalInfo, setPersonalInfoState] = useState<PersonalInfoDraft>(() => createPersonalInfoDraft());
  const [locations, setLocations] = useState<SignupLocationDraft[]>(() => [firstLocation]);
  const [documentsByChargerId, setDocumentsByChargerId] = useState<DocumentsByChargerId>(() =>
    createInitialDocuments(),
  );
  const [consents, setConsents] = useState<ConsentDraft>(() => createConsentDraft());
  const [activeLocationId, setActiveLocationId] = useState(firstLocation.clientId);
  const [activeTab, setActiveTab] = useState<SignupTab>("manual");
  const [review, setReview] = useState<SignupValidationResult | null>(null);
  const [submitState, setSubmitState] = useState<SignupSubmitState>({ status: "idle" });

  const draft = useMemo(
    () => ({
      personalInfo,
      locations,
      documentsByChargerId,
      consents,
    }),
    [consents, documentsByChargerId, locations, personalInfo],
  );

  const setPersonalInfo = (next: PersonalInfoDraft) => {
    setPersonalInfoState(next);

    if (next.accountType === "particulier") {
      setLocations((current) => {
        const first = current[0] || createLocationDraft();
        setActiveLocationId(first.clientId);
        return [first];
      });
    }
  };

  const addLocation = () => {
    const next = createLocationDraft();
    setLocations((current) => [...current, next]);
    setActiveLocationId(next.clientId);
    setDocumentsByChargerId((current) => ({
      ...current,
      ...Object.fromEntries(
        next.chargers.map((charger) => [
          charger.clientId,
          createDocumentDraftsForCharger(charger.clientId),
        ]),
      ),
    }));
  };

  const removeLocation = (locationId: string) => {
    setLocations((current) => {
      if (current.length <= 1) return current;
      const removed = current.find((location) => location.clientId === locationId);
      const next = current.filter((location) => location.clientId !== locationId);
      const nextActive = next[0];

      if (nextActive) {
        setActiveLocationId(nextActive.clientId);
      }

      if (removed) {
        setDocumentsByChargerId((documents) => {
          const nextDocuments = { ...documents };
          removed.chargers.forEach((charger) => {
            delete nextDocuments[charger.clientId];
          });
          return nextDocuments;
        });
      }

      return next;
    });
  };

  const updateLocationAddress = (locationId: string, address: AddressDraft) => {
    setLocations((current) =>
      current.map((location) => (location.clientId === locationId ? { ...location, address } : location)),
    );
  };

  const addCharger = (locationId: string) => {
    const next = createChargerDraft();
    setLocations((current) =>
      current.map((location) =>
        location.clientId === locationId
          ? { ...location, chargers: [...location.chargers, next] }
          : location,
      ),
    );
    setDocumentsByChargerId((current) => ({
      ...current,
      [next.clientId]: createDocumentDraftsForCharger(next.clientId),
    }));
  };

  const updateCharger = (locationId: string, updated: ChargerDraft) => {
    setLocations((current) =>
      current.map((location) =>
        location.clientId === locationId
          ? {
              ...location,
              chargers: location.chargers.map((charger) =>
                charger.clientId === updated.clientId ? updated : charger,
              ),
            }
          : location,
      ),
    );
  };

  const removeCharger = (locationId: string, chargerClientId: string) => {
    setLocations((current) =>
      current.map((location) => {
        if (location.clientId !== locationId || location.chargers.length <= 1) return location;
        return {
          ...location,
          chargers: location.chargers.filter((charger) => charger.clientId !== chargerClientId),
        };
      }),
    );

    setDocumentsByChargerId((current) => {
      const next = { ...current };
      delete next[chargerClientId];
      return next;
    });
  };

  const updateDocument = (updated: ChargerDocumentDraft) => {
    setDocumentsByChargerId((current) => ({
      ...current,
      [updated.chargerClientId]: (current[updated.chargerClientId] || []).map((document) =>
        document.clientId === updated.clientId ? updated : document,
      ),
    }));
  };

  const handleStartDossier = async () => {
    const nextReview = validateSignupDraft(draft);
    setReview(nextReview);
    setSubmitState({ status: "idle" });

    if (!nextReview.canStartDossier) return;

    const idempotencyKey = createSignupIdempotencyKey();
    const config = buildSignupSubmitClientConfig(idempotencyKey);

    if (!config.ok) {
      setSubmitState({ status: "error", message: config.message });
      return;
    }

    setSubmitState({ status: "submitting" });
    const result = await submitSignupPayload(mapSignupDraftToSubmitPayload(draft), config.config);

    if (result.ok) {
      setSubmitState({ status: "success", result });
      return;
    }

    setSubmitState({ status: "error", message: result.message });
  };

  return (
    <div className="site-frame">
      <AppHeader currentPath={currentPath} navigate={navigate} />
      <main className="page-shell">
        <section className="section signup-hero" aria-labelledby="signup-title">
          <div className="container page-intro">
            <p className="eyebrow">Aanmelden</p>
            <h1 id="signup-title">Start je aanmelding</h1>
            <p>Vul je gegevens, laadpalen en documenten lokaal in.</p>
          </div>
        </section>

        <div className="container signup-flow">
          <PersonalInfoSection value={personalInfo} onChange={setPersonalInfo} />
          <ChargerInfoSection
            accountType={personalInfo.accountType}
            activeLocationId={activeLocationId}
            activeTab={activeTab}
            locations={locations}
            onAddCharger={addCharger}
            onAddLocation={addLocation}
            onChangeCharger={updateCharger}
            onLocationAddressChange={updateLocationAddress}
            onRemoveCharger={removeCharger}
            onRemoveLocation={removeLocation}
            onSelectLocation={setActiveLocationId}
            onTabChange={setActiveTab}
          />
          <ChargerDocumentsSection
            accountType={personalInfo.accountType}
            kvkDocument={personalInfo.kvkDocument}
            locations={locations}
            documentsByChargerId={documentsByChargerId}
            onDocumentChange={updateDocument}
          />
          <ConsentSignatureSection value={consents} onChange={setConsents} />

          <section className="signup-section">
            <div className="signup-actions">
              <button
                className="button button-primary"
                disabled={submitState.status === "submitting"}
                onClick={handleStartDossier}
                type="button"
              >
                {submitState.status === "submitting" ? "Versturen..." : "Start dossier"}
              </button>
              <p className="fine-print">Je blijft op deze pagina na het verzenden.</p>
            </div>
            <SignupReviewPanel result={review} />
            <SignupSubmitStatusPanel state={submitState} />
          </section>
        </div>
      </main>
    </div>
  );
}
