import type { ValueYear } from "./dashboardTypes";

type ValueSummaryPanelProps = {
  years: ValueYear[];
};

export function ValueSummaryPanel({ years }: ValueSummaryPanelProps) {
  const handledYears = years.filter((year) => year.mode === "handled");
  const runningYears = years.filter((year) => year.mode === "running");

  return (
    <div className="dashboard-section-card dashboard-section-card-wide">
      <h3>kWh & waarde</h3>

      <div className="value-section">
        <h4>Afgelopen jaren / reeds afgehandeld</h4>
        {handledYears.length ? (
          handledYears.map((year) => <ValueYearCard key={year.year} year={year} showDownloads />)
        ) : (
          <p className="text-muted">Nog geen afgehandelde jaren.</p>
        )}
      </div>

      <div className="value-section">
        <h4>Lopend / toekomstig</h4>
        {runningYears.map((year) => <ValueYearCard key={year.year} year={year} />)}
      </div>
    </div>
  );
}

function ValueYearCard({ year, showDownloads = false }: { year: ValueYear; showDownloads?: boolean }) {
  return (
    <article className="value-year-card">
      <div className="value-year-header">
        <strong>{year.year}</strong>
        <span className={year.mode === "handled" ? "status-pill status-pill-ok" : "status-pill status-pill-warning"}>
          {year.status}
        </span>
      </div>
      <div className="value-grid">
        <span>kWh: {year.kwh}</span>
        <span>Bruto ERE waarde: {year.grossValue}</span>
        <span>Externe verkoop-/transactiekosten: {year.externalCosts}</span>
        <span>ENVAL succesfee: {year.envalFee}</span>
        <span>Netto resultaat klant: {year.netCustomerResult}</span>
      </div>
      {showDownloads ? (
        <div className="asset-actions">
          <button className="button button-secondary" type="button">Download jaaroverzicht</button>
          <button className="button button-ghost" type="button">Download auditoverzicht</button>
        </div>
      ) : (
        <div className="asset-actions">
          <button className="button button-secondary" type="button">Vul kWh in</button>
        </div>
      )}
    </article>
  );
}
