import { useMemo, useState, type ReactNode } from "react";
import type { AuthDossierSummary } from "../auth/authTypes";
import type {
  DashboardCharger,
  DashboardDocumentSlot,
  DashboardDossierSummary,
  DashboardLegalAcceptance,
  DashboardLocation,
  DashboardReadModel,
} from "./dashboardTypes";
import type { DashboardReadState } from "./useDashboardRead";

type AccordionSection = "charger" | "location" | "documents" | "consents" | "kwh";

type InfoRow = {
  label: string;
  value: string;
  status?: string;
};

type PortalCharger = {
  charger: DashboardCharger;
  index: number;
  location: DashboardLocation | null;
  documentSlots: DashboardDocumentSlot[];
};

type ActivePrivateDashboardProps = {
  dashboardRead: DashboardReadState;
  dossierOptions: AuthDossierSummary[];
  onSelectDossier: (dossierId: string) => void;
  selectedDossierId: string | null;
};

export function ActivePrivateDashboard({
  dashboardRead,
  dossierOptions,
  onSelectDossier,
  selectedDossierId,
}: ActivePrivateDashboardProps) {
  const [selectedChargerId, setSelectedChargerId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<AccordionSection | null>(null);
  const model = dashboardRead.model;
  const selectedDossier = model?.selected_dossier ?? dossierOptions.find((dossier) => dossier.dossier_id === selectedDossierId) ?? null;
  const chargerRows = useMemo(() => (model ? buildPortalChargers(model) : []), [model]);

  function toggleCharger(chargerId: string) {
    setSelectedChargerId((currentChargerId) => (currentChargerId === chargerId ? null : chargerId));
    setExpandedSection(null);
  }

  function toggleSection(section: AccordionSection) {
    setExpandedSection((currentSection) => (currentSection === section ? null : section));
  }

  return (
    <div className="portal-content-stack">
      <header className="portal-content-header">
        <div>
          <h1>Actief</h1>
          <p>{selectedDossier ? dossierLabel(selectedDossier) : "Geen dossier geselecteerd"}</p>
        </div>
        {dossierOptions.length > 1 ? (
          <label className="field">
            <span>Dossier</span>
            <select
              aria-label="Selecteer dossier"
              onChange={(event) => {
                setSelectedChargerId(null);
                setExpandedSection(null);
                onSelectDossier(event.target.value);
              }}
              value={selectedDossierId ?? ""}
            >
              {dossierOptions.map((dossier) => (
                <option key={dossier.dossier_id} value={dossier.dossier_id}>
                  {dossierLabel(dossier)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {dashboardRead.status === "loading" || dashboardRead.status === "retrying" ? (
        <DashboardNotice title="Dashboard laden" note="We halen uw dossiergegevens op." />
      ) : null}

      {dashboardRead.status === "error" ? (
        <DashboardNotice
          action={<button className="button button-secondary button-compact" onClick={dashboardRead.retry} type="button">Opnieuw proberen</button>}
          note={dashboardRead.error.message}
          title="Dashboard niet beschikbaar"
        />
      ) : null}

      {dashboardRead.status === "empty" ? (
        <DashboardNotice
          action={<button className="button button-secondary button-compact" onClick={dashboardRead.retry} type="button">Opnieuw proberen</button>}
          note="Er zijn nog geen dashboardgegevens beschikbaar voor dit dossier."
          title="Geen dashboardgegevens"
        />
      ) : null}

      {dashboardRead.status !== "error" && !selectedDossierId ? (
        <DashboardNotice title="Geen dossier gevonden" note="Er is nog geen gekoppeld ENVAL-dossier gevonden." />
      ) : null}

      {model ? (
        <>
          <section className="portal-card-compact" aria-label="Dossier">
            <h2>Dossier</h2>
            <ReadOnlyInfoRows rows={[
              { label: "Dossier", value: dossierLabel(model.selected_dossier) },
              { label: "Type", value: accountTypeLabel(model.selected_dossier.account_type) },
              { label: "Status", value: statusLabel(model.selected_dossier.status), status: statusLabel(model.selected_dossier.status) },
            ]} />
          </section>

          {chargerRows.length ? (
            <section className="charger-tabs" aria-label="Actieve laadpalen">
              {chargerRows.map((row) => {
                const isSelected = row.charger.charger_id === selectedChargerId;

                return (
                  <div className="charger-tab-group" key={row.charger.charger_id}>
                    <button
                      aria-expanded={isSelected}
                      className={isSelected ? "charger-tab-row charger-tab-row-active" : "charger-tab-row"}
                      onClick={() => toggleCharger(row.charger.charger_id)}
                      type="button"
                    >
                      <div>
                        <h2>Laadpaal {row.index}</h2>
                        <p>Locatie: {formatLocationLine(row.location)}</p>
                      </div>
                      <StatusPill status={statusLabel(row.charger.status)} />
                    </button>

                    {isSelected ? (
                      <ChargerInformation
                        expandedSection={expandedSection}
                        legalAcceptances={model.legal_acceptances}
                        onToggleSection={toggleSection}
                        row={row}
                      />
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : (
            <DashboardNotice title="Geen laadpalen gevonden" note="Dit dossier bevat nog geen laadpaalgegevens." />
          )}
        </>
      ) : null}
    </div>
  );
}

function DashboardNotice({ action, title, note }: { action?: ReactNode; title: string; note: string }) {
  return (
    <div className="review-panel" role="status">
      <h3>{title}</h3>
      <p>{note}</p>
      {action ? <div className="section-actions">{action}</div> : null}
    </div>
  );
}

function ChargerInformation({
  expandedSection,
  legalAcceptances,
  onToggleSection,
  row,
}: {
  expandedSection: AccordionSection | null;
  legalAcceptances: DashboardLegalAcceptance[];
  onToggleSection: (section: AccordionSection) => void;
  row: PortalCharger;
}) {
  const chargerStatus = statusLabel(row.charger.status);
  const locationStatus = row.location ? statusLabel(row.location.status) : "Ontbreekt";
  const documentStatus = aggregateDocumentStatus(row.documentSlots);
  const consentStatus = aggregateLegalStatus(legalAcceptances);

  return (
    <div className="charger-info-container">
      <AccordionRow
        expandedSection={expandedSection}
        id="charger"
        onToggleSection={onToggleSection}
        status={chargerStatus}
        title="Laadpaal"
      >
        <ChargerSection row={row} />
      </AccordionRow>

      <AccordionRow
        expandedSection={expandedSection}
        id="location"
        onToggleSection={onToggleSection}
        status={locationStatus}
        title="Locatie"
      >
        <LocationSection location={row.location} />
      </AccordionRow>

      <AccordionRow
        expandedSection={expandedSection}
        id="documents"
        onToggleSection={onToggleSection}
        status={documentStatus}
        title="Documenten"
      >
        <DocumentsSection slots={row.documentSlots} />
      </AccordionRow>

      <AccordionRow
        expandedSection={expandedSection}
        id="consents"
        onToggleSection={onToggleSection}
        status={consentStatus}
        title="Toestemmingen"
      >
        <ConsentsSection acceptances={legalAcceptances} />
      </AccordionRow>

      <AccordionRow
        expandedSection={expandedSection}
        id="kwh"
        onToggleSection={onToggleSection}
        status="Ontbreekt"
        title="kWh"
      >
        <UnavailableSection
          label="kWh"
          note="kWh-gegevens, backend-koppelingen en jaaroverzichten zijn nog niet gekoppeld aan dit dashboard."
        />
      </AccordionRow>
    </div>
  );
}

function AccordionRow({
  id,
  title,
  status,
  expandedSection,
  onToggleSection,
  children,
}: {
  id: AccordionSection;
  title: string;
  status: string;
  expandedSection: AccordionSection | null;
  onToggleSection: (section: AccordionSection) => void;
  children: ReactNode;
}) {
  const isExpanded = expandedSection === id;

  return (
    <div className="charger-accordion-row">
      <button
        aria-expanded={isExpanded}
        className="charger-accordion-header"
        onClick={() => onToggleSection(id)}
        type="button"
      >
        <span>{title}</span>
        <StatusDot status={status} />
      </button>
      {isExpanded ? <div className="charger-accordion-content">{children}</div> : null}
    </div>
  );
}

function ChargerSection({ row }: { row: PortalCharger }) {
  const charger = row.charger;
  const rows: InfoRow[] = [
    { label: "Merk", value: charger.brand || "-" },
    { label: "Model", value: charger.model || "-" },
    { label: "MID-nummer", value: charger.mid_number, status: statusLabel(charger.mid_status) },
    { label: "Serienummer", value: charger.serial_number || "-" },
    { label: "Jaar installatie", value: charger.installation_year ? String(charger.installation_year) : "-" },
    { label: "Back-end leverancier", value: charger.backend_supplier || "-" },
    { label: "Zonnepanelen", value: solarStatusLabel(charger.solar_export_status) },
  ];

  return (
    <ReadOnlyOverview status={statusLabel(charger.status)}>
      <ReadOnlyInfoRows rows={rows} />
    </ReadOnlyOverview>
  );
}

function LocationSection({ location }: { location: DashboardLocation | null }) {
  if (!location) {
    return <UnavailableSection label="Locatie" note="Geen locatiegegevens gevonden voor deze laadpaal." />;
  }

  const rows: InfoRow[] = [
    { label: "Adres", value: location.address.street || "-" },
    { label: "Huisnummer", value: location.address.house_number },
    { label: "Suffix", value: location.address.suffix || "-" },
    { label: "Postcode", value: location.address.postcode },
    { label: "Stad", value: location.address.city || "-" },
    { label: "Land", value: location.address.country },
  ];

  return (
    <ReadOnlyOverview status={statusLabel(location.status)}>
      <ReadOnlyInfoRows rows={rows} />
    </ReadOnlyOverview>
  );
}

function DocumentsSection({ slots }: { slots: DashboardDocumentSlot[] }) {
  if (!slots.length) {
    return <UnavailableSection label="Documenten" note="Er zijn nog geen document-slots voor deze laadpaal." />;
  }

  return (
    <SectionGroup title="Documenten">
      {slots.map((slot) => (
        <EvidenceCard
          fileName={slot.current_file_name}
          key={slot.document_slot_id}
          label={slot.title}
          required={slot.required}
          status={statusLabel(slot.status)}
          versionNumber={slot.current_version_number}
        />
      ))}
    </SectionGroup>
  );
}

function ConsentsSection({ acceptances }: { acceptances: DashboardLegalAcceptance[] }) {
  if (!acceptances.length) {
    return <UnavailableSection label="Toestemmingen" note="Er zijn nog geen toestemmingen gevonden voor dit dossier." />;
  }

  return (
    <SectionGroup title="Toestemmingen">
      {acceptances.map((acceptance) => (
        <DownloadCard
          key={`${acceptance.acceptance_type}-${acceptance.version}`}
          label={legalAcceptanceLabel(acceptance.acceptance_type)}
          note={`Versie ${acceptance.version}${acceptance.accepted_at ? ` · ${formatDate(acceptance.accepted_at)}` : ""}`}
          status={acceptance.active ? "Akkoord" : statusLabel(acceptance.status)}
        />
      ))}
    </SectionGroup>
  );
}

function UnavailableSection({ label, note }: { label: string; note: string }) {
  return (
    <SectionGroup>
      <div className="portal-evidence-card">
        <CardHeader label={label} status="Ontbreekt" />
        <p>{note}</p>
      </div>
    </SectionGroup>
  );
}

function ReadOnlyOverview({ status, children }: { status: string; children: ReactNode }) {
  return (
    <div className="portal-readonly-overview">
      <div className="portal-overview-status">
        <StatusDot status={status} />
      </div>
      {children}
    </div>
  );
}

function ReadOnlyInfoRows({ rows }: { rows: InfoRow[] }) {
  return (
    <dl className="portal-info-rows">
      {rows.map((row) => (
        <div className="portal-info-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
          {row.status && row.status !== "Akkoord" ? <StatusDot status={row.status} /> : null}
        </div>
      ))}
    </dl>
  );
}

function SectionGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="portal-section-group">
      {title ? <h3>{title}</h3> : null}
      <div className="portal-evidence-grid">{children}</div>
    </section>
  );
}

function EvidenceCard({
  label,
  fileName,
  required,
  status,
  versionNumber,
}: {
  label: string;
  fileName: string | null;
  required: boolean;
  status: string;
  versionNumber: number | null;
}) {
  return (
    <div className="portal-evidence-card">
      <CardHeader label={label} status={status} />
      {fileName ? <a href="#" onClick={(event) => event.preventDefault()}>{fileName}</a> : <small>Nog niet ontvangen</small>}
      {versionNumber ? <small>Versie {versionNumber}</small> : null}
      <small>{required ? "Verplicht" : "Optioneel"}</small>
    </div>
  );
}

function DownloadCard({
  label,
  note,
  status = "Akkoord",
}: {
  label: string;
  note?: string;
  status?: string;
}) {
  return (
    <div className="portal-evidence-card">
      <CardHeader label={label} status={status} />
      {note ? <small className="portal-mini-card-note">{note}</small> : null}
      <button className="button button-ghost button-compact" type="button">Download</button>
    </div>
  );
}

function CardHeader({ label, status }: { label: string; status: string }) {
  return (
    <div className="portal-mini-card-header">
      <h3>{label}</h3>
      <StatusDot status={status} />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const className = `status-pill ${statusClassName(status, "status-pill")}`;
  return <span className={className}>{status}</span>;
}

function StatusDot({ status }: { status: string }) {
  const className = `status-dot ${statusClassName(status, "status-dot")}`;
  return <span aria-label={status} className={className} role="img" />;
}

function statusClassName(status: string, prefix: "status-pill" | "status-dot") {
  if (["Actief", "Akkoord", "Ingediend", "Geupload"].includes(status)) {
    return `${prefix}-ok`;
  }

  if (["Afgewezen", "Niet actief"].includes(status)) {
    return `${prefix}-danger`;
  }

  return `${prefix}-warning`;
}

function statusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  const labels: Record<string, string> = {
    accepted: "Akkoord",
    active: "Actief",
    confirmed: "Akkoord",
    current: "Akkoord",
    expected: "Ontbreekt",
    issued: "In review",
    processing: "In review",
    rejected: "Afgewezen",
    submitted: "Ingediend",
    uploaded: "Geupload",
  };

  return labels[normalized] || status || "Onbekend";
}

function accountTypeLabel(accountType: DashboardDossierSummary["account_type"]): string {
  if (accountType === "zakelijk") return "Zakelijk";
  if (accountType === "vve") return "VVE";
  return "Particulier";
}

function dossierLabel(dossier: Pick<DashboardDossierSummary, "account_type" | "dossier_number" | "status">): string {
  const number = dossier.dossier_number || "Dossier";
  return `${number} · ${accountTypeLabel(dossier.account_type)} · ${statusLabel(dossier.status)}`;
}

function buildPortalChargers(model: DashboardReadModel): PortalCharger[] {
  const locationsById = new Map(model.locations.map((location) => [location.location_id, location]));

  return model.chargers.map((charger, index) => ({
    charger,
    index: index + 1,
    location: locationsById.get(charger.location_id) ?? null,
    documentSlots: model.document_slots.filter((slot) => slot.charger_id === charger.charger_id),
  }));
}

function formatLocationLine(location: DashboardLocation | null): string {
  if (!location) return "Locatie onbekend";
  const houseNumber = `${location.address.house_number}${location.address.suffix || ""}`;
  const address = [location.address.street, houseNumber].filter(Boolean).join(" ");
  return [address, location.address.postcode, location.address.city, location.address.country].filter(Boolean).join(", ");
}

function aggregateDocumentStatus(slots: DashboardDocumentSlot[]): string {
  if (!slots.length) return "Ontbreekt";
  if (slots.some((slot) => statusLabel(slot.status) === "Afgewezen")) return "Afgewezen";
  if (slots.some((slot) => !slot.current_file_name || statusLabel(slot.status) === "Ontbreekt")) return "Ontbreekt";
  if (slots.some((slot) => statusLabel(slot.status) === "In review")) return "In review";
  return "Akkoord";
}

function aggregateLegalStatus(acceptances: DashboardLegalAcceptance[]): string {
  if (!acceptances.length) return "Ontbreekt";
  if (acceptances.every((acceptance) => acceptance.active)) return "Akkoord";
  return "In review";
}

function solarStatusLabel(status: string | null): string {
  if (!status) return "-";
  if (status === "unknown") return "Onbekend";
  if (status === "yes") return "Ja";
  if (status === "no") return "Nee";
  return status;
}

function legalAcceptanceLabel(type: string): string {
  const labels: Record<string, string> = {
    consent_bundle: "Toestemming",
    fee_terms: "Fee ENVAL",
    privacy: "Privacy",
    terms: "Alg. Voorwaarden",
  };
  return labels[type] || type.replace(/_/g, " ");
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(date);
}
