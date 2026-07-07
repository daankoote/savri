import { ConsentsPanel } from "./ConsentsPanel";
import { DocumentsPanel } from "./DocumentsPanel";
import { TimelinePanel } from "./TimelinePanel";
import { ValueSummaryPanel } from "./ValueSummaryPanel";
import type { DashboardAsset, DashboardRequest, DashboardView } from "./dashboardTypes";

type AssetDetailPreviewProps = {
  asset: DashboardAsset;
  requests: DashboardRequest[];
  view: DashboardView;
};

export function AssetDetailPreview({ asset, requests, view }: AssetDetailPreviewProps) {
  const scopedRequests = requests.filter((request) => request.assetId === asset.id);

  return (
    <section className="dashboard-card dashboard-panel" aria-labelledby="asset-preview-title">
      <div className="dashboard-panel-header">
        <div>
          <p className="eyebrow">{asset.typeLabel}</p>
          <h2 id="asset-preview-title">{asset.name}</h2>
          <p>{asset.identity}</p>
        </div>
        <span className="status-pill status-pill-warning">{asset.statusLabel}</span>
      </div>

      <div className="asset-detail-grid">
        <div className="dashboard-section-card">
          <h3>Status</h3>
          <p>{asset.nextAction}</p>
        </div>

        <div className="dashboard-section-card">
          <h3>Open acties</h3>
          {scopedRequests.length ? (
            <div className="compact-list">
              {scopedRequests.map((request) => (
                <div key={request.id}>
                  <strong>{request.title}</strong>
                  <p>{request.urgency}</p>
                </div>
              ))}
            </div>
          ) : (
            <p>Geen open acties voor klant.</p>
          )}
        </div>

        <DocumentsPanel documents={asset.documents} />

        <div className="dashboard-section-card">
          <h3>Laadpalen</h3>
          <div className="compact-list">
            {asset.chargers.map((charger) => (
              <div key={charger.id}>
                <strong>{charger.label}</strong>
                <p>{charger.midNumber} — {charger.status}</p>
              </div>
            ))}
          </div>
        </div>

        <ValueSummaryPanel years={asset.valueYears} />

        <div className="dashboard-section-card">
          <h3>Uitbetalingen</h3>
          <p>Alle bedragen blijven indicatief totdat resultaat is gerealiseerd en voorwaarden zijn toegepast.</p>
        </div>

        <TimelinePanel events={asset.timeline} />
        <ConsentsPanel consents={asset.consents} />

        <div className="dashboard-section-card">
          <h3>Downloads</h3>
          <p>Jaaroverzicht en auditoverzicht worden beschikbaar wanneer een jaar is afgehandeld.</p>
        </div>

        <div className="dashboard-section-card dashboard-section-card-wide">
          <h3>Wat is gecontroleerd?</h3>
          <div className="readable-check-grid">
            <div className="readable-check">
              <span>Adresbewijs</span>
              <strong>Akkoord</strong>
            </div>
            <div className="readable-check">
              <span>Installatiefactuur</span>
              <strong>Akkoord</strong>
            </div>
            <div className="readable-check">
              <span>MID bewijs</span>
              <strong>In review</strong>
            </div>
            <div className="readable-check">
              <span>Toestemming</span>
              <strong>Akkoord</strong>
            </div>
            <div className="readable-check">
              <span>kWh</span>
              <strong>Ontbreekt</strong>
            </div>
          </div>
        </div>

        {view === "enval" ? (
          <div className="dashboard-section-card dashboard-section-card-wide internal-review-grid">
            <div>
              <h3>Supportnotities</h3>
              <p>Klant moet energierekening uploaden voor adresmatch.</p>
            </div>
            <div>
              <h3>Interne reviewstatus</h3>
              <p>MID bewijs wacht op handmatige controle.</p>
            </div>
            <div>
              <h3>Audit samenvatting</h3>
              <p>Laatste klantactie en documentstatus zijn vastgelegd.</p>
            </div>
            <div>
              <h3>Laatste wijzigingen</h3>
              <p>kWh verzoek toegevoegd aan lopend jaar.</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
