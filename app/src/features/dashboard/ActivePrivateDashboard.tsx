import { useState, type ReactNode } from "react";
import { backendSuppliers } from "../signup/chargerCatalog";

type AccordionSection = "charger" | "location" | "consents" | "kwh" | "reports" | "changes";

type InfoRow = {
  label: string;
  value: string;
  status?: string;
};

type PortalCharger = {
  id: string;
  title: string;
  location: string;
  status: string;
  brand: string;
  model: string;
  midNumber: string;
  serialNumber: string;
  installationYear: string;
  hasSolarPanels: string;
  address: {
    postcode: string;
    houseNumber: string;
    suffix: string;
    street: string;
    city: string;
    country: string;
  };
  chargerStatus: string;
  locationStatus: string;
  addressEvidenceStatus: string;
  installationInvoiceStatus: string;
  midEvidenceStatus: string;
  consentsStatus: string;
  kwhStatus: string;
  kwhValue: string | null;
  backendConnectionStatus: string;
  reportsStatus: string;
  changesStatus: string;
};

const chargers: PortalCharger[] = [
  {
    id: "charger-1",
    title: "Laadpaal 1",
    location: "Kostverlorenstraat 65, 2042PC, Zandvoort",
    status: "Actie nodig",
    brand: "Alfen",
    model: "Eve Single Pro Line",
    midNumber: "Ontbreekt",
    serialNumber: "AF-2025-1842",
    installationYear: "2025",
    hasSolarPanels: "Nee",
    address: {
      postcode: "2042PC",
      houseNumber: "65",
      suffix: "",
      street: "Kostverlorenstraat",
      city: "Zandvoort",
      country: "Nederland",
    },
    chargerStatus: "Actie nodig",
    locationStatus: "Akkoord",
    addressEvidenceStatus: "Akkoord",
    installationInvoiceStatus: "Akkoord",
    midEvidenceStatus: "Ontbreekt",
    consentsStatus: "Akkoord",
    kwhStatus: "Ontbreekt",
    kwhValue: null,
    backendConnectionStatus: "Niet actief",
    reportsStatus: "Akkoord",
    changesStatus: "Akkoord",
  },
  {
    id: "charger-2",
    title: "Laadpaal 2",
    location: "Kostverlorenstraat 65, 2042PC, Zandvoort",
    status: "In review",
    brand: "Alfen",
    model: "Eve Single Pro Line",
    midNumber: "123456",
    serialNumber: "AF-2025-1843",
    installationYear: "2025",
    hasSolarPanels: "Nee",
    address: {
      postcode: "2042PC",
      houseNumber: "65",
      suffix: "",
      street: "Kostverlorenstraat",
      city: "Zandvoort",
      country: "Nederland",
    },
    chargerStatus: "In review",
    locationStatus: "Akkoord",
    addressEvidenceStatus: "Akkoord",
    installationInvoiceStatus: "In review",
    midEvidenceStatus: "In review",
    consentsStatus: "Akkoord",
    kwhStatus: "Handmatig ingevuld",
    kwhValue: "3.420 kWh",
    backendConnectionStatus: "Niet actief",
    reportsStatus: "Akkoord",
    changesStatus: "Akkoord",
  },
];

const consentItems = [
  { label: "Alg. Voorwaarden", fileName: "algemene-voorwaarden-concept-v1.pdf" },
  { label: "Fee ENVAL", fileName: "fee-enval-concept-v1.pdf" },
  { label: "Privacy", fileName: "privacy-concept-v1.pdf" },
];

const providerOptions = backendSuppliers.slice(0, 8);

export function ActivePrivateDashboard() {
  const [selectedChargerId, setSelectedChargerId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<AccordionSection | null>(null);

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
          <p>Jaar: <strong>2026</strong></p>
        </div>
      </header>

      <section className="charger-tabs" aria-label="Actieve laadpalen">
        {chargers.map((charger) => {
          const isSelected = charger.id === selectedChargerId;

          return (
            <div className="charger-tab-group" key={charger.id}>
              <button
                aria-expanded={isSelected}
                className={isSelected ? "charger-tab-row charger-tab-row-active" : "charger-tab-row"}
                onClick={() => toggleCharger(charger.id)}
                type="button"
              >
                <div>
                  <h2>{charger.title}</h2>
                  <p>Locatie: {charger.location}</p>
                </div>
                <StatusPill status={charger.status} />
              </button>

              {isSelected ? (
                <ChargerInformation
                  charger={charger}
                  expandedSection={expandedSection}
                  onToggleSection={toggleSection}
                />
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function ChargerInformation({
  charger,
  expandedSection,
  onToggleSection,
}: {
  charger: PortalCharger;
  expandedSection: AccordionSection | null;
  onToggleSection: (section: AccordionSection) => void;
}) {
  return (
    <div className="charger-info-container">
      <AccordionRow
        id="charger"
        title="Laadpaal"
        status={charger.chargerStatus}
        expandedSection={expandedSection}
        onToggleSection={onToggleSection}
      >
        <ChargerSection charger={charger} />
      </AccordionRow>

      <AccordionRow
        id="location"
        title="Locatie"
        status={charger.locationStatus}
        expandedSection={expandedSection}
        onToggleSection={onToggleSection}
      >
        <LocationSection charger={charger} />
      </AccordionRow>

      <AccordionRow
        id="consents"
        title="Toestemmingen"
        status={charger.consentsStatus}
        expandedSection={expandedSection}
        onToggleSection={onToggleSection}
      >
        <ConsentsSection />
      </AccordionRow>

      <AccordionRow
        id="kwh"
        title="kWh"
        status={charger.kwhStatus}
        expandedSection={expandedSection}
        onToggleSection={onToggleSection}
      >
        <KwhSection charger={charger} />
      </AccordionRow>

      <AccordionRow
        id="reports"
        title="Rapportages"
        status={charger.reportsStatus}
        expandedSection={expandedSection}
        onToggleSection={onToggleSection}
      >
        <ReportsSection />
      </AccordionRow>

      <AccordionRow
        id="changes"
        title="Aanpassingen"
        status={charger.changesStatus}
        expandedSection={expandedSection}
        onToggleSection={onToggleSection}
      >
        <ChangesSection />
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

function ChargerSection({ charger }: { charger: PortalCharger }) {
  const rows: InfoRow[] = [
    { label: "Merk", value: charger.brand },
    { label: "Model", value: charger.model },
    { label: "MID-nummer", value: charger.midNumber, status: charger.midEvidenceStatus },
    { label: "Serienummer", value: charger.serialNumber },
    { label: "Jaar installatie", value: charger.installationYear },
    { label: "Zonnepanelen aanwezig", value: charger.hasSolarPanels },
  ];

  return (
    <ReadOnlyOverview status={charger.chargerStatus}>
      <ReadOnlyInfoRows rows={rows} />
      <SectionGroup title="Documenten">
        <EvidenceCard
          fileName="installatiefactuur-alfen.pdf"
          label="Installatie factuur"
          status={charger.installationInvoiceStatus}
        />
        <EvidenceCard fileName="mid-bewijs.pdf" label="MID bewijs" status={charger.midEvidenceStatus} />
      </SectionGroup>
    </ReadOnlyOverview>
  );
}

function LocationSection({ charger }: { charger: PortalCharger }) {
  const rows: InfoRow[] = [
    { label: "Adres", value: charger.address.street },
    { label: "Huisnummer", value: charger.address.houseNumber },
    { label: "Suffix", value: charger.address.suffix || "-" },
    { label: "Postcode", value: charger.address.postcode },
    { label: "Stad", value: charger.address.city },
    { label: "Land", value: charger.address.country },
  ];

  return (
    <ReadOnlyOverview status={charger.locationStatus}>
      <ReadOnlyInfoRows rows={rows} />
      <SectionGroup title="Documenten">
        <EvidenceCard
          fileName="energierekening-2026.pdf"
          label="Adres bevestiging"
          status={charger.addressEvidenceStatus}
        />
      </SectionGroup>
    </ReadOnlyOverview>
  );
}

function ConsentsSection() {
  return (
    <SectionGroup title="Documenten">
      {consentItems.map((item) => (
        <DownloadCard fileName={item.fileName} label={item.label} key={item.label} />
      ))}
    </SectionGroup>
  );
}

function KwhSection({ charger }: { charger: PortalCharger }) {
  const isKwhAction = isActionStatus(charger.kwhStatus);

  return (
    <div className="portal-section-stack">
      <SectionGroup title="Handmatig">
        <div className="portal-evidence-card">
          <CardHeader label="kWh status" status={charger.kwhStatus} />
          {charger.kwhValue ? <strong>{charger.kwhValue}</strong> : null}
          {isKwhAction ? (
            <button className="button button-secondary button-compact" type="button">Vul waarde in</button>
          ) : null}
        </div>

        <label className="portal-evidence-card portal-upload-mini">
          <CardHeader label="kWh document" status="Actie nodig" />
          <p>Upload hier uw overzicht van het kWh-gebruik voor de huidige periode 2026.</p>
          <input aria-label="Upload kWh overzicht" type="file" />
        </label>
      </SectionGroup>

      <SectionGroup title="Automatisch">
        <div className="portal-evidence-card">
          <CardHeader label="Backend koppeling" status={charger.backendConnectionStatus} />
          {/* Exact provider connection flow still needs research before real implementation. */}
          <select aria-label="Back-end leverancier">
            <option value="">Kies leverancier</option>
            {providerOptions.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
          <button className="button button-secondary button-compact" type="button">Koppel</button>
        </div>
      </SectionGroup>
    </div>
  );
}

function ReportsSection() {
  return (
    <SectionGroup>
      <DownloadCard label="Audit Rapport" note="vanaf moment van aanvraag tot heden" />
      <DownloadCard label="Jaaroverzicht" note="beschikbaar zodra jaar is afgehandeld" status="Ontbreekt" />
    </SectionGroup>
  );
}

function ChangesSection() {
  return (
    <div className="portal-change-actions">
      <button className="button button-secondary button-compact" type="button">Verhuizing</button>
      <button className="button button-secondary button-compact" type="button">Zakelijk rijden</button>
      <button className="button button-ghost button-compact" type="button">Meer aanpassingen</button>
    </div>
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

function EvidenceCard({ label, fileName, status }: { label: string; fileName: string; status: string }) {
  return (
    <div className="portal-evidence-card">
      <CardHeader label={label} status={status} />
      <a href="#" onClick={(event) => event.preventDefault()}>{fileName}</a>
      {isActionStatus(status) ? (
        <button className="button button-secondary button-compact" type="button">Aanvullen</button>
      ) : null}
    </div>
  );
}

function DownloadCard({
  label,
  fileName,
  note,
  status = "Akkoord",
}: {
  label: string;
  fileName?: string;
  note?: string;
  status?: string;
}) {
  return (
    <div className="portal-evidence-card">
      <CardHeader label={label} status={status} />
      {fileName ? <a href="#" onClick={(event) => event.preventDefault()}>{fileName}</a> : null}
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

function isActionStatus(status: string) {
  return ["Ontbreekt", "In review", "Actie nodig"].includes(status);
}

function statusClassName(status: string, prefix: "status-pill" | "status-dot") {
  if (["Actief", "Akkoord", "Uitgelezen", "Handmatig ingevuld"].includes(status)) {
    return `${prefix}-ok`;
  }

  if (["Afgewezen", "Niet actief"].includes(status)) {
    return `${prefix}-danger`;
  }

  return `${prefix}-warning`;
}
