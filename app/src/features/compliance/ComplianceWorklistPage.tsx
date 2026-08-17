import type { SafeComplianceWorklistItemV1 } from "../../../../supabase/functions/_shared/app_compliance_worklist.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import type { ComplianceWorklistSafeError } from "./complianceWorklistClient.ts";
import {
  type ComplianceWorklistReadState,
  useComplianceWorklist,
} from "./useComplianceWorklist.ts";

type ComplianceWorklistContentProps = Readonly<{
  state: ComplianceWorklistReadState;
  onRefresh: () => void;
}>;

type ActionPresentation = Readonly<{
  title: string;
  actor: string;
  explanation: string;
}>;

const ACTION_PRESENTATION: Record<SafeComplianceWorklistItemV1["actionKind"], ActionPresentation> = {
  FINDINGS_REPORT_ATTENTION: {
    title: "Bevindingenrapport vraagt interne aandacht",
    actor: "ENVAL coördineert de interne opvolging",
    explanation: "Een niet-positieve verificatie-uitkomst vraagt aandacht. Een herstel- of afsluitworkflow is nog niet onderdeel van deze werklijst.",
  },
  INBOOKING_CUTOFF_ATTENTION: {
    title: "Inboeking afronden",
    actor: "ENVAL als inboeker",
    explanation: "Aandachtspunt voor de inboeking binnen de getoonde servertermijn.",
  },
  STATEMENT_POSSESSION_ATTENTION: {
    title: "Verificatieverklaring beschikbaar hebben",
    actor: "ENVAL coördineert als inboeker",
    explanation: "Aandachtspunt voor tijdige beschikbaarheid van de verificatieverklaring.",
  },
  STATEMENT_SUBMISSION_ATTENTION: {
    title: "Verificatieverklaring indienen bij NEa",
    actor: "ENVAL als inboeker",
    explanation: "Aandachtspunt voor indiening binnen de getoonde servertermijn.",
  },
  VERIFIER_REV_REGISTRATION_ATTENTION: {
    title: "REV-registratie door verificateur bewaken",
    actor: "Verificateur voert uit; ENVAL bewaakt de afstemming",
    explanation: "De registratie is een externe actie van de verificateur en wordt niet door ENVAL uitgevoerd.",
  },
  YEAR_END_OPERATIONAL_ATTENTION: {
    title: "Operationele jaargrens",
    actor: "Informatieve kalendermijlpaal",
    explanation: "Deze mijlpaal geeft context en is geen taak of aftekenmoment.",
  },
};

const STATUS_PRESENTATION: Record<SafeComplianceWorklistItemV1["temporalStatus"], Readonly<{
  label: string;
  className: string;
}>> = {
  BLOCKED: { label: "Geblokkeerd", className: "status-pill-danger" },
  DUE: { label: "Nu aandacht nodig", className: "status-pill-warning" },
  OVERDUE: { label: "Termijn verstreken", className: "status-pill-danger" },
  REACHED: { label: "Bereikt", className: "status-pill-ok" },
  UPCOMING: { label: "Komend", className: "status-pill-warning" },
};

function formatServerDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function boundaryLabel(item: SafeComplianceWorklistItemV1): string | null {
  if (!item.boundary) return null;
  if (item.boundarySemantics === "EXCLUSIVE_BEFORE") {
    return `Voor ${formatServerDate(item.boundary)}`;
  }
  if (item.boundarySemantics === "CALENDAR_BOUNDARY") {
    return `Kalendergrens ${formatServerDate(item.boundary)}`;
  }
  return `Uiterlijk ${formatServerDate(item.boundary)}`;
}

function AttentionItem({ item }: { item: SafeComplianceWorklistItemV1 }) {
  const presentation = ACTION_PRESENTATION[item.actionKind];
  const status = STATUS_PRESENTATION[item.temporalStatus];
  const boundary = boundaryLabel(item);
  return (
    <li className="portal-row">
      <div>
        <h3>{presentation.title}</h3>
        <p>{presentation.actor}</p>
        <p>{presentation.explanation}</p>
        {boundary ? <p><strong>{boundary}</strong></p> : null}
      </div>
      <span className={`status-pill ${status.className}`}>{status.label}</span>
    </li>
  );
}

function errorTitle(error: ComplianceWorklistSafeError): string {
  if (error.code === "unauthorized") return "Inloggen vereist";
  if (error.code === "forbidden") return "Geen toegang";
  if (error.code === "unsupported_delivery_year") return "Leveringsjaar niet ondersteund";
  return "Compliancewerklijst niet beschikbaar";
}

export function ComplianceWorklistContent({ state, onRefresh }: ComplianceWorklistContentProps) {
  if (state.status === "loading") {
    return (
      <div className="portal-content-stack">
        <header className="portal-content-header">
          <div>
            <h1>Compliancewerklijst</h1>
            <p>Leveringsjaar 2026</p>
          </div>
        </header>
        <div className="review-panel" role="status" aria-live="polite">
          <h3>Werklijst laden</h3>
          <p>De actuele serverbeoordeling wordt opgehaald.</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    const mayRetry = state.error.code !== "unauthorized" &&
      state.error.code !== "forbidden" &&
      state.error.code !== "unsupported_delivery_year";
    return (
      <div className="portal-content-stack">
        <header className="portal-content-header">
          <div>
            <h1>Compliancewerklijst</h1>
            <p>Leveringsjaar 2026</p>
          </div>
        </header>
        <div className="review-panel" role="alert">
          <h3>{errorTitle(state.error)}</h3>
          <p>{state.error.message}</p>
          {mayRetry
            ? (
              <div className="section-actions">
                <button className="button button-secondary button-compact" onClick={onRefresh} type="button">
                  Opnieuw laden
                </button>
              </div>
            )
            : null}
        </div>
      </div>
    );
  }

  const { value } = state;
  return (
    <div className="portal-content-stack">
      <header className="portal-content-header">
        <div>
          <h1>Compliancewerklijst</h1>
          <p>
            Leveringsjaar {value.deliveryYear} · Beoordeeld op {formatServerDate(value.asOf)}
          </p>
        </div>
        <button className="button button-secondary button-compact" onClick={onRefresh} type="button">
          Verversen
        </button>
      </header>

      <section className="portal-card-compact" aria-labelledby="active-attention-title">
        <div>
          <h2 id="active-attention-title">Actuele aandachtspunten</h2>
          <p>Afgeleid door de server uit de geregistreerde compliancegegevens.</p>
        </div>
        {value.activeAttention.length > 0
          ? (
            <ul className="portal-row-list">
              {value.activeAttention.map((item, index) => (
                <AttentionItem item={item} key={`${item.actionKind}-${item.boundary ?? index}`} />
              ))}
            </ul>
          )
          : (
            <div className="review-panel review-panel-ok" role="status">
              <h3>Geen actuele aandachtspunten</h3>
              <p>Geen actuele aandachtspunten op basis van de geregistreerde compliancegegevens.</p>
            </div>
          )}
      </section>

      {value.milestones.length > 0
        ? (
          <section className="portal-card-compact" aria-labelledby="milestones-title">
            <div>
              <h2 id="milestones-title">Informatieve mijlpalen</h2>
              <p>Operationele kalendercontext; dit zijn geen taken of aftekenmomenten.</p>
            </div>
            <ul className="portal-row-list">
              {value.milestones.map((item, index) => (
                <AttentionItem item={item} key={`${item.actionKind}-${item.boundary ?? index}`} />
              ))}
            </ul>
          </section>
        )
        : null}

      <p>
        {value.evidenceStatus === "NO_ACCEPTED_SOURCE_FACTS_RECORDED"
          ? "Er zijn geen geaccepteerde bronfeiten geregistreerd; deze weergave bewijst niet dat alle externe handelingen zijn voltooid."
          : `Gebaseerd op ${value.sourceEventCount} geaccepteerde bronregistratie${value.sourceEventCount === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}

export function ComplianceWorklistPageContent() {
  const auth = useAuth();
  const worklist = useComplianceWorklist(auth.session?.access_token ?? null);
  return <ComplianceWorklistContent onRefresh={worklist.refresh} state={worklist.state} />;
}
